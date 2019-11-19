import * as Melon from '@melonproject/melonjs';
import melonMainnetDeployment from '@melonproject/melonjs/deployments/mainnet.js';
import {BigNumber} from 'bignumber.js';

//combine USD markets and Melon PriceSource Contract data into one exchange rate lookup table
async function getExchangeRates(web3) {
  //{keys} = denomination symbol, value = {keys} of base symbol, value = rate
  const exchangeRateLookup = {
    ETH: {},
    BTC: {},
    USD: {}
  }
  const [usdPrices, priceSourceData] = await Promise.all([
    fetchUsdPrices(),
    fetchMelonPriceData(web3)
  ])

  exchangeRateLookup['USD']['ETH'] = BigNumber(usdPrices.ethUsd);
  exchangeRateLookup['USD']['BTC'] = BigNumber(usdPrices.btcUsd);
  exchangeRateLookup['ETH']['USD'] = BigNumber(1/usdPrices.ethUsd);
  exchangeRateLookup['BTC']['USD'] = BigNumber(1/usdPrices.btcUsd);
  exchangeRateLookup['ETH']['BTC'] = BigNumber(usdPrices.btcUsd/usdPrices.ethUsd);
  exchangeRateLookup['BTC']['ETH'] = BigNumber(usdPrices.ethUsd/usdPrices.btcUsd);

  //get which token Melon price data is denominated in
  const melonQuoteToken = getTokenByAddress(priceSourceData.quoteToken)
  const normalizedMelonQuoteSymbol = normalizeTokenSymbol(melonQuoteToken.symbol)
  if(!Object.keys(exchangeRateLookup).includes(normalizedMelonQuoteSymbol))
    exchangeRateLookup[normalizedMelonQuoteSymbol] = {}

  //copy Melon price data into quote token price list
  for(const priceData of priceSourceData.prices) {
    const symbol = normalizeTokenSymbol(getTokenByAddress(priceData.token).symbol)
    if(symbol != normalizedMelonQuoteSymbol && exchangeRateLookup[normalizedMelonQuoteSymbol][symbol] == undefined)
      exchangeRateLookup[normalizedMelonQuoteSymbol][symbol] = BigNumber(priceData.price).dividedBy(Math.pow(10,melonQuoteToken.decimals))
  }

  //calculate exchange rates for remaining denomination tokens
  for(const denomToken of Object.keys(exchangeRateLookup)) {
    if(denomToken == normalizedMelonQuoteSymbol)
      continue;
    const melonTokenToDenomToken = exchangeRateLookup[denomToken][normalizedMelonQuoteSymbol]
    for(const baseToken of Object.keys(exchangeRateLookup[normalizedMelonQuoteSymbol])) {
      if(baseToken != denomToken && exchangeRateLookup[denomToken][baseToken] == undefined)
      exchangeRateLookup[denomToken][baseToken] = exchangeRateLookup[normalizedMelonQuoteSymbol][baseToken].multipliedBy(melonTokenToDenomToken)
    }
  }
  return exchangeRateLookup
}

//fetch USD market prices from Messari API
async function fetchUsdPrices() {
  const btcUrl = "https://data.messari.io/api/v1/assets/btc/metrics"
  const ethUrl = "https://data.messari.io/api/v1/assets/eth/metrics"
  try {
    const [btcResponse, ethResponse] = await Promise.all([
      fetch(btcUrl),
      fetch(ethUrl)
    ])
    if(!btcResponse.ok || !ethResponse.ok)
      throw new Error(btcResponse.statusText + ' ' + ethResponse.statusText)
    const btcUsdJson = await btcResponse.json()
    const ethUsdJson = await ethResponse.json()
    return {btcUsd: btcUsdJson.data.market_data.price_usd, ethUsd: ethUsdJson.data.market_data.price_usd};
  } catch (e) {
    console.log(e)
  }
}

//fetch token price data from Melon on-chain price oracle
async function fetchMelonPriceData(web3) {
  const priceSourceData = {}
  const env = new Melon.Environment(web3.eth);
  const priceSource = new Melon.CanonicalPriceFeed(env, melonMainnetDeployment.melonContracts.priceSource)
  try {
    const [quoteToken, prices] = await Promise.all([
      priceSource.getQuoteToken('latest'),
      priceSource.getPrices(melonMainnetDeployment.thirdPartyContracts.tokens.map(token => token.address))
    ])
    priceSourceData.quoteToken = quoteToken
    priceSourceData.prices = prices
  } catch(e) {
    console.log(e)
  }
  return priceSourceData
}

//consolidate similar tokens for easier exchange rate handling
function normalizeTokenSymbol(symbol) {
  symbol = symbol.toUpperCase()
  const symbolLookup = {
    'BTC': ['WBTC', 'TBTC'],
    'ETH': ['WETH'],
    'USD': ['DAI', 'USDC', 'USDT', 'GUSD', 'PAX']
  }
  for(const normalSymbol of Object.keys(symbolLookup)) {
    if(symbolLookup[normalSymbol].includes(symbol))
      return normalSymbol
  }
  return symbol
}

//get token object by address from Melon token registry
function getTokenByAddress(addr) {
  return melonMainnetDeployment.thirdPartyContracts.tokens.find(token => addr.toLowerCase() == token.address.toLowerCase())
}

//get token object by symbol from Melon token registry
function getTokenBySymbol(sym) {
  if(sym == 'BTC')
    sym = 'WBTC'
  if(sym == 'ETH')
    sym = 'WETH'
  return melonMainnetDeployment.thirdPartyContracts.tokens.find(token => sym.toUpperCase() == token.symbol.toUpperCase())
}

//price data object for app
class PriceSource {
  constructor(web3) {
    this.web3 = web3
    this.getPrice = this.getPrice.bind(this)
  }

  async init() {
    this.exchangeRates = await getExchangeRates(this.web3)
  }

  //calculate price of baseSymbol balance in terms of quoteSymbol
  getPrice(balance, baseSymbol, quoteSymbol) { 
    balance = BigNumber(balance)
    baseSymbol = normalizeTokenSymbol(baseSymbol)
    quoteSymbol = normalizeTokenSymbol(quoteSymbol)
  
    if(baseSymbol == quoteSymbol)
      return balance

    return this.exchangeRates[quoteSymbol][baseSymbol].multipliedBy(balance)
  }
}

export {PriceSource, getTokenByAddress, getTokenBySymbol}