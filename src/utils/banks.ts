// Auto-generated bank logo utility file
import bankLogoMapJson from '../../public/bank-logos/bank-logo-map.json';
import { StaticImageData } from 'next/image';

// Define interface for bank logo mapping from JSON
interface BankLogoMapping {
  [bankCode: string]: {
    name: string;
    logoPath: string;
  }
}

// Type assertion for the imported JSON data
const typedBankLogoMap = bankLogoMapJson as unknown as BankLogoMapping;

// Bank logo map by bank code (legacy format)
export const bankLogoMap: Record<string, string> = {
  "100": "default-image.png",
  "101": "default-image.png",
  "102": "default-image.png",
  "125": "default-image.png",
  "214": "first-city-monument-bank.png",
  "215": "default-image.png",
  "221": "stanbic-ibtc-bank.png",
  "232": "sterling-bank.png",
  "301": "default-image.png",
  "302": "taj-bank.png",
  "303": "lotus-bank.png",
  "327": "paga.png",
  "401": "asosavings.png",
  "526": "default-image.png",
  "562": "ekondo-microfinance-bank.png",
  "565": "default-image.png",
  "566": "default-image.png",
  "50211": "kuda-bank.png",
  "50383": "default-image.png",
  "50515": "moniepoint-mfb-ng.png",
  "50823": "cemcs-microfinance-bank.png",
  "50931": "default-image.png",
  "51211": "default-image.png",
  "51310": "sparkle-microfinance-bank.png",
  "100004": "paycom.png",
  "999991": "palmpay.png",
  "999992": "paycom.png",
  "044": "access-bank.png",
  "063": "access-bank-diamond.png",
  "035A": "alat-by-wema.png",
  "023": "citibank-nigeria.png",
  "050": "ecobank-nigeria.png",
  "070": "fidelity-bank.png",
  "011": "first-bank-of-nigeria.png",
  "00103": "globus-bank.png",
  "058": "guaranty-trust-bank.png",
  "030": "heritage-bank.png",
  "082": "keystone-bank.png",
  "076": "polaris-bank.png",
  "068": "standard-chartered-bank.png",
  "032": "union-bank-of-nigeria.png",
  "033": "united-bank-for-africa.png",
  "035": "wema-bank.png",
  "057": "zenith-bank.png"
};

/**
 * Get the bank logo filename by bank code
 * @param bankCode The bank code
 * @returns The bank logo filename or default-image.png if not found
 */
export function getBankLogo(bankCode: string): string {
  return bankLogoMap[bankCode] || 'default-image.png';
}

/**
 * Get the bank name by bank code
 * @param bankCode The bank code
 * @returns The bank name or 'Unknown Bank' if not found
 */
export function getBankName(bankCode: string): string {
  const bankMap: Record<string, string> = {
    "044": "Access Bank",
    "063": "Access Bank (Diamond)",
    "035A": "ALAT by WEMA",
    "401": "ASO Savings and Loans",
    "50931": "Bowen Microfinance Bank",
    "50823": "CEMCS Microfinance Bank",
    "023": "Citibank Nigeria",
    "050": "Ecobank Nigeria",
    "562": "Ekondo Microfinance Bank",
    "070": "Fidelity Bank",
    "011": "First Bank of Nigeria",
    "214": "First City Monument Bank",
    "00103": "Globus Bank",
    "058": "Guaranty Trust Bank",
    "50383": "Hasal Microfinance Bank",
    "030": "Heritage Bank",
    "301": "Jaiz Bank",
    "082": "Keystone Bank",
    "50211": "Kuda Bank",
    "303": "Lotus Bank",
    "50515": "Moniepoint MFB",
    "565": "One Finance",
    "999992": "OPay",
    "327": "Paga",
    "999991": "PalmPay",
    "526": "Parallex Bank",
    "100004": "PayCom",
    "076": "Polaris Bank",
    "101": "Providus Bank",
    "125": "Rubies MFB",
    "51310": "Sparkle Microfinance Bank",
    "221": "Stanbic IBTC Bank",
    "068": "Standard Chartered Bank",
    "232": "Sterling Bank",
    "100": "Suntrust Bank",
    "302": "TAJ Bank",
    "51211": "TCF MFB",
    "102": "Titan Trust Bank",
    "032": "Union Bank of Nigeria",
    "033": "United Bank For Africa",
    "215": "Unity Bank",
    "566": "VFD",
    "035": "Wema Bank",
    "057": "Zenith Bank"
  };
  
  return bankMap[bankCode] || 'Unknown Bank';
}

// Paycrest bank list for reference and fallback
const paycrestBankList = [
  {"name":"Access Bank","code":"ABNGNGLA"},
  {"name":"Diamond Bank","code":"DBLNNGLA"},
  {"name":"Fidelity Bank","code":"FIDTNGLA"},
  {"name":"FCMB","code":"FCMBNGLA"},
  {"name":"First Bank Of Nigeria","code":"FBNINGLA"},
  {"name":"Guaranty Trust Bank","code":"GTBINGLA"},
  {"name":"Polaris Bank","code":"PRDTNGLA"},
  {"name":"Union Bank","code":"UBNINGLA"},
  {"name":"United Bank for Africa","code":"UNAFNGLA"},
  {"name":"Citibank","code":"CITINGLA"},
  {"name":"Ecobank Bank","code":"ECOCNGLA"},
  {"name":"Heritage","code":"HBCLNGLA"},
  {"name":"Keystone Bank","code":"PLNINGLA"},
  {"name":"Stanbic IBTC Bank","code":"SBICNGLA"},
  {"name":"Standard Chartered Bank","code":"SCBLNGLA"},
  {"name":"Sterling Bank","code":"NAMENGLA"},
  {"name":"Unity Bank","code":"ICITNGLA"},
  {"name":"Suntrust Bank","code":"SUTGNGLA"},
  {"name":"Providus Bank","code":"PROVNGLA"},
  {"name":"FBNQuest Merchant Bank","code":"KDHLNGLA"},
  {"name":"Greenwich Merchant Bank","code":"GMBLNGLA"},
  {"name":"FSDH Merchant Bank","code":"FSDHNGLA"},
  {"name":"Rand Merchant Bank","code":"FIRNNGLA"},
  {"name":"Jaiz Bank","code":"JAIZNGLA"},
  {"name":"Zenith Bank","code":"ZEIBNGLA"},
  {"name":"Wema Bank","code":"WEMANGLA"},
  {"name":"Kuda Microfinance Bank","code":"KUDANGPC"},
  {"name":"OPay","code":"OPAYNGPC"},
  {"name":"PalmPay","code":"PALMNGPC"},
  {"name":"Paystack-Titan MFB","code":"PAYTNGPC"},
  {"name":"Moniepoint MFB","code":"MONINGPC"},
  {"name":"Safe Haven MFB","code":"SAHVNGPC"}
];

// This map translates Paycrest's unique bank codes to our internal bank codes.
const paycrestCodeToInternalCode: Record<string, string> = {
  'ABNGNGLA': '044',       // Access Bank
  'DBLNNGLA': '063',       // Diamond Bank (now Access)
  'FIDTNGLA': '070',       // Fidelity Bank
  'FCMBNGLA': '214',       // FCMB
  'FBNINGLA': '011',       // First Bank
  'GTBINGLA': '058',       // Guaranty Trust Bank
  'PRDTNGLA': '076',       // Polaris Bank
  'UBNINGLA': '032',       // Union Bank
  'UNAFNGLA': '033',       // United Bank for Africa
  'CITINGLA': '023',       // Citibank
  'ECOCNGLA': '050',       // Ecobank
  'HBCLNGLA': '030',       // Heritage Bank
  'PLNINGLA': '082',       // Keystone Bank
  'SBICNGLA': '221',       // Stanbic IBTC Bank
  'SCBLNGLA': '068',       // Standard Chartered Bank
  'NAMENGLA': '232',       // Sterling Bank
  'ICITNGLA': '215',       // Unity Bank
  'SUTGNGLA': '100',       // Suntrust Bank
  'PROVNGLA': '101',       // Providus Bank
  'JAIZNGLA': '301',       // Jaiz Bank
  'ZEIBNGLA': '057',       // Zenith Bank
  'WEMANGLA': '035',       // Wema Bank
  'KUDANGPC': '50211',     // Kuda Microfinance Bank
  'OPAYNGPC': '999992',     // OPay (is Paycom)
  'PALMNGPC': '999991',     // PalmPay
  'MONINGPC': '50515',     // Moniepoint MFB
  'PAYTNGPC': '102',       // Paystack-Titan MFB -> Titan Trust Bank
};

/**
 * Get the bank name from a Paycrest bank code.
 * This function uses both the new JSON mapping and legacy mappings for maximum compatibility.
 * @param paycrestCode The bank code from Paycrest API.
 * @returns The bank name.
 */
export function getBankNameFromPaycrestCode(paycrestCode: string): string {
  // First try the JSON mapping
  if (paycrestCode && typedBankLogoMap[paycrestCode]) {
    return typedBankLogoMap[paycrestCode].name;
  }
  
  // Then try the internal mapping
  const internalCode = paycrestCodeToInternalCode[paycrestCode];
  if (internalCode) {
    return getBankName(internalCode);
  }
  
  // Fallback to the Paycrest list if no internal mapping exists
  const bank = paycrestBankList.find(b => b.code === paycrestCode);
  return bank ? bank.name : 'Unknown Bank';
}

/**
 * Get the bank logo from a Paycrest bank code.
 * This function uses both the new JSON mapping and legacy mappings for maximum compatibility.
 * @param paycrestCode The bank code from Paycrest API.
 * @returns The path to the bank logo image.
 */
export function getBankLogoFromPaycrestCode(paycrestCode: string): string {
  // Safety check for undefined or null
  if (!paycrestCode) {
    return `/bank-logos/default-image.png`;
  }
  
  // Special case for PalmPay - check by name or code
  if (paycrestCode === 'PALMNGPC' || paycrestCode === '999991' || paycrestCode === 'PalmPay') {
    return '/bank-logos/palmpay.png';
  }
  
  // First try the JSON mapping
  if (typedBankLogoMap[paycrestCode]) {
    return typedBankLogoMap[paycrestCode].logoPath;
  }
  
  // Then try the internal mapping
  const internalCode = paycrestCodeToInternalCode[paycrestCode];
  if (internalCode) {
    const logoFile = getBankLogo(internalCode);
    return `/bank-logos/${logoFile}`;
  }
  
  // Try to find a default logo for this bank in common banks
  const commonBanks: Record<string, string> = {
    'KUDANGPC': '/bank-logos/kuda-bank.png',
    'OPAYNGPC': '/bank-logos/opay.png',
    'PALMNGPC': '/bank-logos/palmpay.png',
    'MONINGPC': '/bank-logos/moniepoint-mfb-ng.png',
    'ZEIBNGLA': '/bank-logos/zenith-bank.png',
    'GTBINGLA': '/bank-logos/guaranty-trust-bank.png',
    'FBNINGLA': '/bank-logos/first-bank-of-nigeria.png',
    'ABNGNGLA': '/bank-logos/access-bank.png',
    'WEMANGLA': '/bank-logos/wema-bank.png',
    'UNAFNGLA': '/bank-logos/united-bank-for-africa.png',
  };
  
  if (commonBanks[paycrestCode]) {
    return commonBanks[paycrestCode];
  }
  
  // Final fallback
  return `/bank-logos/default-image.png`;
}

/**
 * Get all available banks
 * @returns Array of bank codes and names
 */
export const getAllBanks = () => {
  // Combine banks from both the JSON mapping and legacy mapping
  const jsonBanks = Object.entries(typedBankLogoMap).map(([code, data]) => ({
    code,
    name: data.name,
    logoPath: data.logoPath
  }));
  
  // Add any banks from the legacy mapping that aren't in the JSON
  const legacyBanks = Object.entries(bankLogoMap).map(([code, logoFile]) => ({
    code,
    name: getBankName(code),
    logoPath: `/bank-logos/${logoFile}`
  }));
  
  // Return unique banks by code
  const allBanks = [...jsonBanks, ...legacyBanks];
  const uniqueBanks = allBanks.filter((bank, index, self) => 
    index === self.findIndex(b => b.code === bank.code)
  );
  
  return uniqueBanks;
};
