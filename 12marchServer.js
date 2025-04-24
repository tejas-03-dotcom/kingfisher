const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();

// Use cookie parser
//app.use(cookieParser());

// Enable CORS for your frontend domain
app.use(cors({
  origin: 'https://kingfisher-kcfv.onrender.com',
  credentials: true
}));

// Cookie jar for maintaining NSE session
let nseCookies = null;

// Helper function to fetch NSE cookies
async function fetchNSECookies() {
  try {
    const response = await axios.get('https://www.nseindia.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    nseCookies = response.headers['set-cookie'].join('; ');
    return nseCookies;
  } catch (error) {
    console.error("Error fetching NSE cookies:", error);
    return null;
  }
}

// Middleware to ensure we have NSE cookies
app.use('/api/nse/*', async (req, res, next) => {
  if (!nseCookies) {
    await fetchNSECookies();
    if (!nseCookies) {
      return res.status(500).json({ error: 'Failed to establish NSE session' });
    }
  }
  next();
});

// Option chain endpoint
app.get('/api/nse/option-chain', async (req, res) => {
  const { symbol, expiry } = req.query;

  if (!symbol || !expiry) {
    return res.status(400).json({ error: 'Symbol and expiry date are required.' });
  }

  try {
    const response = await axios.get(`https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/',
        'Accept': 'application/json',
        'Cookie': nseCookies
      }
    });

    const records = response.data.records;
    if (!records || !records.data) {
      return res.status(500).json({ error: 'Invalid API response.' });
    }

    // Format expiry date to match NSE's format (dd-MMM-yyyy)
    const expiryDate = new Date(expiry).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).replace(/ /g, '-');

    const filteredData = records.data.filter(item => item.expiryDate === expiryDate);
    const marketPrice = records.underlyingValue;

    const optionData = filteredData.map(item => ({
      strikePrice: item.strikePrice,
      marketPrice: marketPrice,
      call: {
        LTP: item.CE ? item.CE.lastPrice : 0,
        OI: item.CE ? item.CE.openInterest : 0,
        changeInOI: item.CE ? item.CE.changeinOpenInterest : 0,
        pchangeInOI: item.CE ? item.CE.pchangeinOpenInterest : 0
      },
      put: {
        LTP: item.PE ? item.PE.lastPrice : 0,
        OI: item.PE ? item.PE.openInterest : 0,
        changeInOI: item.PE ? item.PE.changeinOpenInterest : 0,
        pchangeInOI: item.PE ? item.PE.pchangeinOpenInterest : 0
      }
    }));

    res.json({
      data: optionData,
      marketPrice: marketPrice,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching option chain:', error);
    
    // Reset cookies if request failed
    nseCookies = null;
    
    res.status(500).json({ 
      error: 'Failed to fetch data from NSE',
      details: error.message
    });
  }
});

// India VIX endpoint
app.get('/api/nse/india-vix', async (req, res) => {
  try {
    const response = await axios.get('https://www.nseindia.com/api/option-chain-indices?symbol=INDIAVIX', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': nseCookies
      }
    });
    
    res.json({
      vix: parseFloat(response.data.records.underlyingValue),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching India VIX:", error);
    res.status(500).json({ error: 'Failed to fetch India VIX' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
