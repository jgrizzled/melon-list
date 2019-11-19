import Web3 from 'web3'; //Ethereum blockchain API
import $ from 'jquery';
import * as Melon from '@melonproject/melonjs'; //Melon Ethereum App API
import {FundRankingAbi} from '@melonproject/melonjs/abis/fundRanking.abi'; //Melon fund list contract ABI
import melonMainnetDeployment from '@melonproject/melonjs/deployments/mainnet'; //Melon mainnet contract addresses
import BigNumber from 'bignumber.js';
import {PriceSource, getTokenByAddress} from './js/priceSource' //exchange rate functions
import {formatNumber, formatUnixDate} from './js/utils'
import './styles/styles.scss';

//const web3 = new Web3('https://mainnet.infura.io/v3/b89c21c5a5d149d7b38562a7f28f201e');
const web3 = new Web3('http://192.168.1.22:8545');

const priceSource = new PriceSource(web3)
let fundList = []
let displaySymbol = 'ETH'

const fundTableSelector = '#fund-table'
const currencySelector = '#currency-selector'
const searchFormSelector = '#search-funds'
const searchBoxSelector = '#fund-name'

//fund search box component
class SearchBox {
  constructor() {
    this.handleSubmit = this.handleSubmit.bind(this)
    $(searchFormSelector).one('submit', this.handleSubmit)
  }
  handleSubmit(event) {
    event.preventDefault()
    $(fundTableSelector).off()
    $('tbody').remove()
    const searchString = $(searchBoxSelector).val()
    let searchResults = fundList
    if(searchString != '') {
      searchResults = fundList.filter((fund) => {
        return fund.name.toLowerCase().includes(searchString.toLowerCase())
      })
    }
    $(fundTableSelector).removeClass('hidden')
    const fundTable = new FundTable(searchResults)
    $(searchFormSelector).one('submit', this.handleSubmit)
  }
}

//main fund table component
class FundTable {
  constructor(fundList) {
    this.fundRows = []
    //spawn fund row objects
    fundList.forEach((fund, i) => {
      this.fundRows.push(
        new FundRow(
          i,
          {
            address: fund.address, 
            name: fund.name,
            gav: fund.gav,
            sharePrice: fund.sharePrice,
            creationTime: fund.creationTime,
            denominationAsset: fund.denominationAsset
          }
        )
      )
      this.fundRows[i].render();
    })
    this.handleRadioClick = this.handleRadioClick.bind(this)
    $(currencySelector).off()
    $(currencySelector).one('click', '.price-radio', this.handleRadioClick)
  }
  sortFunds(sortBy) {
    //Todo: sort rendered rows
  }
  handleRadioClick(event) {
    if(displaySymbol != event.target.value) {
      displaySymbol = event.target.value
      for(const row of this.fundRows) {
        row.setState({displaySymbol: this.displaySymbol})
      }
    }
    $(currencySelector).one('click', '.price-radio', this.handleRadioClick)
  }
}

//fund row component
class FundRow {
  constructor(index, fundData) {
    this.state = {
      expanded: false,
      displaySymbol: displaySymbol
    }
    this.getPrice = priceSource.getPrice
    this.name = fundData.name;
    this.rank = index
    this.gav = fundData.gav
    this.sharePrice = fundData.sharePrice
    this.creationTime = fundData.creationTime
    this.denominationAsset = fundData.denominationAsset
    this.address = fundData.address
    this.hasLoadedDetails = false;
    this.details = {}
    this.handleClick = this.handleClick.bind(this)
    this.selector = '#a'+this.address
    $(fundTableSelector).append(`
      <tbody class="fund-tbody" id="a${this.address}"></tbody>`)
      .one('click',  this.selector, this.handleClick)
  }
  render() {
    let html = `
      <tr class="fund-row">
        <td>${this.rank+1}</td>
        <td>${this.name}</td>
        <td>${this.formatBalance(this.gav)}</td>
        <td>${this.formatBalance(this.sharePrice)}</td>
        <td>${formatUnixDate(this.creationTime*1000)}</td>
      </tr>`
    //expandable row with more fund details
    if(this.state.expanded) {
      html += `
        <tr class="fund-expander" height="0">
          <td></td>
          <td colspan="4">
            <ul>
            <li>NAV: ${this.formatBalance(this.details.nav)}</li>
            <li>Investors: ${this.details.investors.length}</li>
            <li>Management Fee: ${formatNumber(this.details.managementFee)}</li>
            <li>Performance Fee: ${formatNumber(this.details.performanceFee)}</li>
            <li>Holdings
              <ul>`
      this.details.holdings.forEach((holding) => {
        if(holding.balance > 0)
          html += `<li>${formatNumber(holding.balance)} ${holding.token.symbol}</li>`
      })
      html += `</ul></li>
            </ul>
          </td>
        </tr>`
    }
    $(this.selector).html(html);
  }
  setState(obj) {
		for (const key of Object.keys(obj)) {
			this.state[key] = obj[key];
    }
    this.render();
  }
  //toggle expandable detail row
  toggleExpander() { 
    if(!this.state.expanded) {
      this.setState({expanded: true})
    }
    else
      this.setState({expanded: false})
  }
  handleClick() {
    if(!this.hasLoadedDetails) {
      //call blockchain API for more details before showing expander
      fetchFundDetails(web3, this.address, this.denominationAsset.decimals).then((details) => {
        this.details = details
        this.hasLoadedDetails = true;
        this.toggleExpander();
        $(fundTableSelector).one('click',  this.selector, this.handleClick)
      })
    }
    else {
      this.toggleExpander();
      $(fundTableSelector).one('click',  this.selector, this.handleClick)
    }
  }
  formatBalance(balance) {
    return formatNumber(this.getPrice(balance,this.denominationAsset.symbol,displaySymbol))
  }
}

//retrieve list of Melon funds via web3 API
async function fetchFundList(web3) {
  const funds = [];
  const fundRankingAddress = melonMainnetDeployment.melonContracts.ranking;
  const versionAddress = melonMainnetDeployment.melonContracts.version;
  const fundRanking = new web3.eth.Contract(FundRankingAbi, fundRankingAddress);
  try {
    //read Melon Fund Ranking contract state 
    const [fundDetails, fundGavs] = await Promise.all([
      fundRanking.methods.getFundDetails(versionAddress).call(),
      fundRanking.methods.getFundGavs(versionAddress).call(),
    ]);
    const {
      0: addresses,
      1: sharePrices,
      2: creationTimes,
      3: names,
      4: denominationAssets,
    } = fundDetails;
    const { 1: gavs } = fundGavs;
    for(let i in addresses) {
      const denominationAsset = getTokenByAddress(denominationAssets[i])
      funds.push({
        address: addresses[i],
        //convert Ethereum blockchain integer-based numbers to floating point
        sharePrice: BigNumber(sharePrices[i]).dividedBy(Math.pow(10, denominationAsset.decimals)),
        creationTime: creationTimes[i],
        name: web3.utils.toUtf8(names[i]),
        denominationAsset: denominationAsset,
        gav: BigNumber(gavs[i]).dividedBy(Math.pow(10, denominationAsset.decimals))
      })
    }
    return funds;
  } catch(e) {
    console.log(e)
  }
}

//retrieve details on individual fund from its Melon contracts
async function fetchFundDetails(web3, hubAddress, denomAssetDecimals) {
  const env = new Melon.Environment(web3.eth);
  const hub = new Melon.Hub(env, hubAddress);
  const details = {}
  try {
    const routes = await hub.getRoutes()
    const accounting = new Melon.Accounting(env, routes.accounting);
    const shares = new Melon.Shares(env, routes.shares)
    const participation = new Melon.Participation(env, routes.participation)
    const feeManager = new Melon.FeeManager(env, routes.feeManager);  
    const trading = new Melon.Trading(env, routes.trading)
    const [holdings, calcResults, shareDecimals, investors, managementFee, performanceFee, exchanges] = await Promise.all([
      accounting.getFundHoldings('latest'),
      accounting.getCalculationResults('latest'),
      shares.getDecimals(),
      participation.getHistoricalInvestors('latest'),
      feeManager.getManagementFeeInformation('latest'),
      feeManager.getPerformanceFeeInformation('latest'),
      trading.getExchangeInfo('latest')
    ])
    details.holdings = [];
    for(const address of Object.keys(holdings)) {
      const token = getTokenByAddress(address)
      details.holdings.push({token: token, balance: holdings[address].dividedBy(Math.pow(10, token.decimals))})
    }
    details.nav = calcResults.nav.dividedBy(Math.pow(10, denomAssetDecimals))
    details.feesInDenominationAsset = calcResults.feesInDenominationAsset.dividedBy(Math.pow(10, denomAssetDecimals))
    details.feesInShares = calcResults.feesInShares.dividedBy(Math.pow(10, shareDecimals))
    details.gavPerShareNetManagementFee = calcResults.gavPerShareNetManagementFee.dividedBy(Math.pow(10, denomAssetDecimals))
    details.managementFee = managementFee.rate.dividedBy(Math.pow(10, denomAssetDecimals))
    details.performanceFee = performanceFee.rate.dividedBy(Math.pow(10, denomAssetDecimals))

    details.investors = [];
    const promises = [];
    investors.forEach((inv) => {
      details.investors.push({address: inv, balance: 0})
      promises.push(shares.getBalanceOf(inv, 'latest'))
    })
    const investorsShares = await Promise.all(promises)
    for(let i = 0; i < details.investors.length; i++) {
      details.investors[i].balance = investorsShares[i].dividedBy(Math.pow(10, shareDecimals));
    }
    details.exchanges = [];
    for(const key of Object.keys(exchanges)) {
      details.exchanges.push(key)
    }
    return details
  } catch(e) {
    console.log(e)
  }
}

//on document load
$(async () => {
  [, fundList] = await Promise.all([
    priceSource.init(),
    fetchFundList(web3)
  ])
  //TODO: normalize values to account for different denoms
  fundList.sort((a, b) => {
    if(BigNumber(a.gav).comparedTo(b.gav) == 1)
      return -1
    else if (BigNumber(a.gav).comparedTo(b.gav) == 0)
      return 0
    return 1
  })
  const searchBox = new SearchBox()
})