// Shared country filter — used by Shop (Products / Stores) and Cars.
// BINDING contract: the Cars part imports exactly this interface, do not
// change the exported names or their shapes.
//   COUNTRIES, COUNTRY_STORAGE_KEY, getStoredCountry, detectCountry,
//   normalizeCountry, matchesCountry, useCountryFilter
import { useEffect, useState } from 'react'

// Full ISO 3166-1 list (alpha-2 code + common short name), for the
// country <select>. Short names on purpose: "South Korea" instead of
// "Korea, Republic of", so name matching works on what people type.
export const COUNTRIES = [
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AX', name: 'Åland Islands' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AS', name: 'American Samoa' },
  { code: 'AD', name: 'Andorra' },
  { code: 'AO', name: 'Angola' },
  { code: 'AI', name: 'Anguilla' },
  { code: 'AQ', name: 'Antarctica' },
  { code: 'AG', name: 'Antigua and Barbuda' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AM', name: 'Armenia' },
  { code: 'AW', name: 'Aruba' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' },
  { code: 'BS', name: 'Bahamas' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BB', name: 'Barbados' },
  { code: 'BY', name: 'Belarus' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BZ', name: 'Belize' },
  { code: 'BJ', name: 'Benin' },
  { code: 'BM', name: 'Bermuda' },
  { code: 'BT', name: 'Bhutan' },
  { code: 'BO', name: 'Bolivia' },
  { code: 'BQ', name: 'Bonaire, Sint Eustatius and Saba' },
  { code: 'BA', name: 'Bosnia and Herzegovina' },
  { code: 'BW', name: 'Botswana' },
  { code: 'BV', name: 'Bouvet Island' },
  { code: 'BR', name: 'Brazil' },
  { code: 'IO', name: 'British Indian Ocean Territory' },
  { code: 'BN', name: 'Brunei' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'BF', name: 'Burkina Faso' },
  { code: 'BI', name: 'Burundi' },
  { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' },
  { code: 'CA', name: 'Canada' },
  { code: 'CV', name: 'Cape Verde' },
  { code: 'KY', name: 'Cayman Islands' },
  { code: 'CF', name: 'Central African Republic' },
  { code: 'TD', name: 'Chad' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CX', name: 'Christmas Island' },
  { code: 'CC', name: 'Cocos (Keeling) Islands' },
  { code: 'CO', name: 'Colombia' },
  { code: 'KM', name: 'Comoros' },
  { code: 'CG', name: 'Congo' },
  { code: 'CD', name: 'Congo, Democratic Republic of the' },
  { code: 'CK', name: 'Cook Islands' },
  { code: 'CR', name: 'Costa Rica' },
  { code: 'CI', name: "Côte d'Ivoire" },
  { code: 'HR', name: 'Croatia' },
  { code: 'CU', name: 'Cuba' },
  { code: 'CW', name: 'Curaçao' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' },
  { code: 'DJ', name: 'Djibouti' },
  { code: 'DM', name: 'Dominica' },
  { code: 'DO', name: 'Dominican Republic' },
  { code: 'EC', name: 'Ecuador' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SV', name: 'El Salvador' },
  { code: 'GQ', name: 'Equatorial Guinea' },
  { code: 'ER', name: 'Eritrea' },
  { code: 'EE', name: 'Estonia' },
  { code: 'SZ', name: 'Eswatini' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'FK', name: 'Falkland Islands' },
  { code: 'FO', name: 'Faroe Islands' },
  { code: 'FJ', name: 'Fiji' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'GF', name: 'French Guiana' },
  { code: 'PF', name: 'French Polynesia' },
  { code: 'TF', name: 'French Southern Territories' },
  { code: 'GA', name: 'Gabon' },
  { code: 'GM', name: 'Gambia' },
  { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' },
  { code: 'GH', name: 'Ghana' },
  { code: 'GI', name: 'Gibraltar' },
  { code: 'GR', name: 'Greece' },
  { code: 'GL', name: 'Greenland' },
  { code: 'GD', name: 'Grenada' },
  { code: 'GP', name: 'Guadeloupe' },
  { code: 'GU', name: 'Guam' },
  { code: 'GT', name: 'Guatemala' },
  { code: 'GG', name: 'Guernsey' },
  { code: 'GN', name: 'Guinea' },
  { code: 'GW', name: 'Guinea-Bissau' },
  { code: 'GY', name: 'Guyana' },
  { code: 'HT', name: 'Haiti' },
  { code: 'HM', name: 'Heard Island and McDonald Islands' },
  { code: 'VA', name: 'Holy See' },
  { code: 'HN', name: 'Honduras' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IM', name: 'Isle of Man' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' },
  { code: 'JP', name: 'Japan' },
  { code: 'JE', name: 'Jersey' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'KI', name: 'Kiribati' },
  { code: 'KP', name: 'North Korea' },
  { code: 'KR', name: 'South Korea' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'LA', name: 'Laos' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'LS', name: 'Lesotho' },
  { code: 'LR', name: 'Liberia' },
  { code: 'LY', name: 'Libya' },
  { code: 'LI', name: 'Liechtenstein' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MO', name: 'Macao' },
  { code: 'MG', name: 'Madagascar' },
  { code: 'MW', name: 'Malawi' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MV', name: 'Maldives' },
  { code: 'ML', name: 'Mali' },
  { code: 'MT', name: 'Malta' },
  { code: 'MH', name: 'Marshall Islands' },
  { code: 'MQ', name: 'Martinique' },
  { code: 'MR', name: 'Mauritania' },
  { code: 'MU', name: 'Mauritius' },
  { code: 'YT', name: 'Mayotte' },
  { code: 'MX', name: 'Mexico' },
  { code: 'FM', name: 'Micronesia' },
  { code: 'MD', name: 'Moldova' },
  { code: 'MC', name: 'Monaco' },
  { code: 'MN', name: 'Mongolia' },
  { code: 'ME', name: 'Montenegro' },
  { code: 'MS', name: 'Montserrat' },
  { code: 'MA', name: 'Morocco' },
  { code: 'MZ', name: 'Mozambique' },
  { code: 'MM', name: 'Myanmar' },
  { code: 'NA', name: 'Namibia' },
  { code: 'NR', name: 'Nauru' },
  { code: 'NP', name: 'Nepal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NC', name: 'New Caledonia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NI', name: 'Nicaragua' },
  { code: 'NE', name: 'Niger' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NU', name: 'Niue' },
  { code: 'NF', name: 'Norfolk Island' },
  { code: 'MK', name: 'North Macedonia' },
  { code: 'MP', name: 'Northern Mariana Islands' },
  { code: 'NO', name: 'Norway' },
  { code: 'OM', name: 'Oman' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PW', name: 'Palau' },
  { code: 'PS', name: 'Palestine' },
  { code: 'PA', name: 'Panama' },
  { code: 'PG', name: 'Papua New Guinea' },
  { code: 'PY', name: 'Paraguay' },
  { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PN', name: 'Pitcairn' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'PR', name: 'Puerto Rico' },
  { code: 'QA', name: 'Qatar' },
  { code: 'RE', name: 'Réunion' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'RW', name: 'Rwanda' },
  { code: 'BL', name: 'Saint Barthélemy' },
  { code: 'SH', name: 'Saint Helena, Ascension and Tristan da Cunha' },
  { code: 'KN', name: 'Saint Kitts and Nevis' },
  { code: 'LC', name: 'Saint Lucia' },
  { code: 'MF', name: 'Saint Martin (French part)' },
  { code: 'PM', name: 'Saint Pierre and Miquelon' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines' },
  { code: 'WS', name: 'Samoa' },
  { code: 'SM', name: 'San Marino' },
  { code: 'ST', name: 'Sao Tome and Principe' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SN', name: 'Senegal' },
  { code: 'RS', name: 'Serbia' },
  { code: 'SC', name: 'Seychelles' },
  { code: 'SL', name: 'Sierra Leone' },
  { code: 'SG', name: 'Singapore' },
  { code: 'SX', name: 'Sint Maarten (Dutch part)' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'SB', name: 'Solomon Islands' },
  { code: 'SO', name: 'Somalia' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'GS', name: 'South Georgia and the South Sandwich Islands' },
  { code: 'SS', name: 'South Sudan' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SD', name: 'Sudan' },
  { code: 'SR', name: 'Suriname' },
  { code: 'SJ', name: 'Svalbard and Jan Mayen' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SY', name: 'Syria' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TJ', name: 'Tajikistan' },
  { code: 'TZ', name: 'Tanzania' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TL', name: 'Timor-Leste' },
  { code: 'TG', name: 'Togo' },
  { code: 'TK', name: 'Tokelau' },
  { code: 'TO', name: 'Tonga' },
  { code: 'TT', name: 'Trinidad and Tobago' },
  { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Türkiye' },
  { code: 'TM', name: 'Turkmenistan' },
  { code: 'TC', name: 'Turks and Caicos Islands' },
  { code: 'TV', name: 'Tuvalu' },
  { code: 'UG', name: 'Uganda' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'UM', name: 'United States Minor Outlying Islands' },
  { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'VU', name: 'Vanuatu' },
  { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'VG', name: 'Virgin Islands (British)' },
  { code: 'VI', name: 'Virgin Islands (U.S.)' },
  { code: 'WF', name: 'Wallis and Futuna' },
  { code: 'EH', name: 'Western Sahara' },
  { code: 'YE', name: 'Yemen' },
  { code: 'ZM', name: 'Zambia' },
  { code: 'ZW', name: 'Zimbabwe' },
]

export const COUNTRY_STORAGE_KEY = 'yently-country'

// Stored value = ISO code string, or '' = show all countries.
// null = nothing stored yet (first visit / never chose).
export function getStoredCountry() {
  try {
    const v = window.localStorage.getItem(COUNTRY_STORAGE_KEY)
    return v === null ? null : v
  } catch {
    return null
  }
}

function countryName(code) {
  const found = COUNTRIES.find(c => c.code === code)
  return found ? found.name : ''
}

// Region from the browser language, e.g. 'fr-FR' -> 'FR'.
// '' when the language carries no usable region.
function languageRegionCode() {
  try {
    const lang = (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || ''
    const region = (lang.split('-')[1] || '').toUpperCase()
    if (/^[A-Z]{2}$/.test(region) && COUNTRIES.some(c => c.code === region)) return region
  } catch {
    // fall through
  }
  return ''
}

// Detect the visitor's country: IP lookup first (~3s timeout), then the
// browser-language region, then 'US'. Returns { code, name }.
// Returns null only on an unexpected error outside the fallback chain —
// a failed lookup on its own is NOT null, it falls back.
export async function detectCountry() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    try {
      const res = await fetch('https://ipapi.co/json/', { signal: controller.signal })
      if (res.ok) {
        const data = await res.json()
        const code = String(data.country_code || '').toUpperCase()
        if (/^[A-Z]{2}$/.test(code)) {
          return { code, name: data.country_name || countryName(code) || code }
        }
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    // Lookup failed (offline, blocked, timed out) — fall through.
  }
  const langCode = languageRegionCode()
  if (langCode) return { code: langCode, name: countryName(langCode) }
  return { code: 'US', name: 'United States' }
}

// Common spellings the stored data actually uses, plus official long
// names — all keyed uppercased. Name/code matching against COUNTRIES
// below covers everything else (e.g. 'Morocco' -> 'MA').
const COUNTRY_ALIASES = {
  'USA': 'US',
  'U.S.A.': 'US',
  'UNITED STATES': 'US',
  'UNITED STATES OF AMERICA': 'US',
  'AMERICA': 'US',
  'UK': 'GB',
  'U.K.': 'GB',
  'UNITED KINGDOM': 'GB',
  'GREAT BRITAIN': 'GB',
  'ENGLAND': 'GB',
  'SCOTLAND': 'GB',
  'WALES': 'GB',
  'RUSSIA': 'RU',
  'RUSSIAN FEDERATION': 'RU',
  'SOUTH KOREA': 'KR',
  'KOREA, REPUBLIC OF': 'KR',
  'REPUBLIC OF KOREA': 'KR',
  'NORTH KOREA': 'KP',
  "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF": 'KP',
  'IRAN': 'IR',
  'VIETNAM': 'VN',
  'VIET NAM': 'VN',
  'BOLIVIA': 'BO',
  'VENEZUELA': 'VE',
  'TANZANIA': 'TZ',
  'SYRIA': 'SY',
  'LAOS': 'LA',
  "LAO PEOPLE'S DEMOCRATIC REPUBLIC": 'LA',
  'BRUNEI': 'BN',
  'BRUNEI DARUSSALAM': 'BN',
  'MOLDOVA': 'MD',
  'REPUBLIC OF MOLDOVA': 'MD',
  'PALESTINE': 'PS',
  'STATE OF PALESTINE': 'PS',
  'IVORY COAST': 'CI',
  "COTE D'IVOIRE": 'CI',
  'CAPE VERDE': 'CV',
  'CABO VERDE': 'CV',
  'EAST TIMOR': 'TL',
  'TIMOR-LESTE': 'TL',
  'SWAZILAND': 'SZ',
  'CZECH REPUBLIC': 'CZ',
  'CZECHIA': 'CZ',
  'HOLLAND': 'NL',
  'BURMA': 'MM',
  'TURKEY': 'TR',
  'MACAO': 'MO',
  'MACAU': 'MO',
  'CURACAO': 'CW',
  'REUNION': 'RE',
}

// Normalize any stored/spoken country value to an ISO code.
// '' / null / unknown -> '' (unknown on purpose: an unrecognized value
// must never silently match a real country).
export function normalizeCountry(value) {
  if (value === null || value === undefined) return ''
  const key = String(value).trim().toUpperCase()
  if (!key) return ''
  if (COUNTRY_ALIASES[key]) return COUNTRY_ALIASES[key]
  const byCode = COUNTRIES.find(c => c.code === key)
  if (byCode) return byCode.code
  const byName = COUNTRIES.find(c => c.name.toUpperCase() === key)
  if (byName) return byName.code
  return ''
}

// Does an item/store country pass the active filter?
// code falsy ('') -> show all. A missing/unknown item country is
// excluded while any filter is active.
export function matchesCountry(itemCountry, code) {
  if (!code) return true
  const normalized = normalizeCountry(itemCountry)
  return normalized !== '' && normalized === code
}

// ---- shared state -------------------------------------------------------
// Module-level so the top bar and every listing page stay in sync: one
// choice, one 'yently-country-change' event, every useCountryFilter()
// instance updates together. Detection runs once per page load.
let sharedCountry = null // null = not resolved yet; '' = show all
let sharedReady = false
let detectionStarted = false

function emitCountryChange() {
  try {
    window.dispatchEvent(new CustomEvent('yently-country-change', {
      detail: { country: sharedCountry, ready: sharedReady },
    }))
  } catch {
    // dispatch failure must never break the filter
  }
}

function storeCountry(code) {
  try {
    window.localStorage.setItem(COUNTRY_STORAGE_KEY, code)
  } catch {
    // private mode etc. — the in-memory value still works for this visit
  }
}

// React hook: { country, countryName, setCountry, clearCountry, ready }.
// country is an ISO code, or '' for show-all. On mount: a stored choice
// wins at once; otherwise the language-region fallback (or 'US') shows
// immediately and detectCountry() updates it in the background —
// rendering is never blocked on the lookup.
export function useCountryFilter() {
  const [state, setState] = useState(() => {
    if (sharedCountry !== null) return { country: sharedCountry, ready: sharedReady }
    const stored = getStoredCountry()
    if (stored !== null) {
      sharedCountry = stored
      sharedReady = true
      return { country: stored, ready: true }
    }
    const fallback = languageRegionCode() || 'US'
    sharedCountry = fallback
    sharedReady = false
    return { country: fallback, ready: false }
  })

  useEffect(() => {
    const onChange = (e) => {
      const detail = (e && e.detail) || {}
      setState({
        country: detail.country !== undefined ? detail.country : sharedCountry,
        ready: detail.ready !== undefined ? detail.ready : sharedReady,
      })
    }
    window.addEventListener('yently-country-change', onChange)
    if (!detectionStarted) {
      detectionStarted = true
      if (getStoredCountry() === null) {
        detectCountry()
          .then((res) => {
            // A choice stored meanwhile wins over the lookup.
            if (getStoredCountry() !== null) {
              sharedCountry = getStoredCountry()
            } else if (res && res.code) {
              sharedCountry = res.code
            }
            sharedReady = true
            emitCountryChange()
          })
          .catch(() => {
            sharedReady = true
            emitCountryChange()
          })
      } else {
        sharedReady = true
      }
    }
    return () => window.removeEventListener('yently-country-change', onChange)
  }, [])

  const setCountry = (code) => {
    const next = code || ''
    storeCountry(next)
    sharedCountry = next
    sharedReady = true
    emitCountryChange()
  }
  const clearCountry = () => setCountry('')

  return {
    country: state.country,
    countryName: countryName(state.country),
    setCountry,
    clearCountry,
    ready: state.ready,
  }
}
