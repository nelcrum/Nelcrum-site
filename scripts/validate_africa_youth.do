/*==============================================================================
  validate_africa_youth.do

  Independent check of "Africa's Youth Unemployment" (nelcrum.com/africa-youth.html).
  Downloads the World Bank data fresh, rebuilds every figure the
  article quotes, and compares the published data files value by value.

  Requirements: Stata 14 or later and internet access. No add-on packages:
                the World Bank's own CSV downloads are read directly.
  Run:          do validate_africa_youth.do
  Output:       validate_africa_youth.log, plus a PASS/FAIL line for each check.

  Data: World Bank, World Development Indicators
    SL.UEM.1524.ZS     Youth unemployment, ages 15-24 (% of labor force), ILO modeled
    SL.EMP.VULN.ZS     Vulnerable employment (% of total employment), ILO modeled
    SP.POP.0014.TO.ZS  Population ages 0-14 (% of total population)
==============================================================================*/

version 14
clear all
set more off
capture log close
log using validate_africa_youth.log, replace text

local YEAR  2025
local URL   "https://nelcrum.com/data/africa-youth"
local TOL   0.051      // published values are rounded to one decimal

* Africa: World Bank Sub-Saharan Africa region (48) + 6 African members of its
* Middle East and North Africa region (DZA DJI EGY LBY MAR TUN) = 54 economies
local AFRICA AGO BDI BEN BFA BWA CAF CIV CMR COD COG COM CPV DJI DZA EGY ERI ///
    ETH GAB GHA GIN GMB GNB GNQ KEN LBR LBY LSO MAR MDG MLI MOZ MRT MUS MWI NAM ///
    NER NGA RWA SDN SEN SLE SOM SSD STP SWZ SYC TCD TGO TUN TZA UGA ZAF ZMB ZWE
local FIVE   FRA CHN GBR USA DEU            // countries in the WSJ chart
local PROTEST KEN NGA TGO MAR MDG CMR TZA   // protest table

capture program drop check
program define check
    args ok label
    if `ok' display as result "PASS  " as text "`label'"
    else    display as error  "FAIL  `label'"
end

* getpub: fetch a published data file. nelcrum.com first; if Stata's Java cannot
* verify that site's certificate (Stata 14 predates Let's Encrypt's root), use the
* same file from the GitHub repository that publishes the site; else a local copy.
capture program drop getpub
program define getpub
    args fname
    foreach base in "https://nelcrum.com/data/africa-youth" "https://raw.githubusercontent.com/nelcrum/Nelcrum-site/main/data/africa-youth" {
        capture copy "`base'/`fname'" "pub_`fname'", replace
        if !_rc {
            display as text "      Read `fname' from `base'"
            exit
        }
    }
    capture confirm file "`fname'"
    if !_rc {
        copy "`fname'" "pub_`fname'", replace
        display as text "      Read `fname' from a local copy in this folder"
        exit
    }
    display as error "Could not download `fname'. Save https://nelcrum.com/data/africa-youth/`fname'"
    display as error "into this folder from a web browser, then run the do-file again."
    exit 601
end

*------------------------------------------------------------------------------
* 1. Fresh World Bank pull, all years
*------------------------------------------------------------------------------
* wbget: download one indicator as the World Bank's bulk CSV, reshape to long.
* Optional third argument "meta" also saves the World Bank region of each economy.
capture program drop wbget
program define wbget
    args ind short meta
    capture erase wb_download.zip
    copy "https://api.worldbank.org/v2/en/indicator/`ind'?downloadformat=csv" wb_download.zip, replace
    unzipfile wb_download.zip, replace
    local files : dir . files "API_`ind'_DS2*.csv"
    local f : word 1 of `files'
    if `"`f'"' == "" {
        display as error "Downloaded file for `ind' not found"
        exit 601
    }
    if "`meta'" == "meta" {
        local mfiles : dir . files "Metadata_Country_API_`ind'_DS2*.csv"
        local mf : word 1 of `mfiles'
        * bindquote(strict) keeps quoted notes that contain line breaks in one row
        import delimited using `"`mf'"', varnames(nonames) stringcols(_all) encoding("utf-8") bindquote(strict) clear
        keep v1 v2
        rename (v1 v2) (iso3 wbregion)
        replace iso3 = trim(iso3)
        keep if regexm(iso3, "^[A-Z][A-Z0-9][A-Z0-9]$")
        duplicates drop iso3, force
        save wb_regions.dta, replace
    }
    import delimited using `"`f'"', varnames(nonames) stringcols(_all) encoding("utf-8") bindquote(strict) clear
    gen long obsno = _n
    quietly summarize obsno if v2 == "Country Code"
    local h = r(min)
    foreach v of varlist v* {
        local lab = `v'[`h']
        if "`lab'" == "Country Name" rename `v' countryname
        else if "`lab'" == "Country Code" rename `v' iso3
        else if regexm("`lab'", "^[12][0-9][0-9][0-9]$") rename `v' `short'`lab'
        else drop `v'
    }
    drop if obsno <= `h'
    drop obsno
    replace iso3 = trim(iso3)
    keep if regexm(iso3, "^[A-Z][A-Z0-9][A-Z0-9]$")
    duplicates drop iso3, force
    reshape long `short', i(iso3) j(year)
    destring `short', replace
    capture erase wb_download.zip
    local tidy : dir . files "*_`ind'_DS2*.csv"
    foreach x of local tidy {
        capture erase `"`x'"'
    }
end

tempfile acc
display as text _n "Downloading World Bank data (three files, about a minute) ..."
wbget SL.UEM.1524.ZS yu meta
save `acc', replace
wbget SL.EMP.VULN.ZS ve
merge 1:1 iso3 year using `acc', nogenerate
save `acc', replace
wbget SP.POP.0014.TO.ZS u15
merge 1:1 iso3 year using `acc', nogenerate
keep iso3 countryname year yu ve u15

gen byte africa = 0
foreach c of local AFRICA {
    quietly replace africa = 1 if iso3 == "`c'"
}
gen byte five = 0
foreach c of local FIVE {
    quietly replace five = 1 if iso3 == "`c'"
}
gen byte protest = 0
foreach c of local PROTEST {
    quietly replace protest = 1 if iso3 == "`c'"
}
merge m:1 iso3 using wb_regions.dta, keep(master match) nogenerate
* Check the Africa definition against the World Bank's own classification
preserve
keep if year == `YEAR'
gen byte should_be = (wbregion == "Sub-Saharan Africa") | inlist(iso3, "DZA", "DJI", "EGY", "LBY", "MAR", "TUN")
quietly count if wbregion == "Sub-Saharan Africa"
local nssa = r(N)
local ok = (`nssa' == 48)
check `ok' "World Bank lists 48 Sub-Saharan Africa economies (found `nssa')"
quietly count if should_be != africa
local nm = r(N)
local ok = (`nm' == 0)
check `ok' "Article's 54-economy Africa list matches World Bank regions (`nm' differences)"
if `nm' list iso3 countryname wbregion africa if should_be != africa, noobs clean
restore
tempfile wb
save `wb'

*------------------------------------------------------------------------------
* 2. Headline figures, 2025, from unrounded data
*------------------------------------------------------------------------------
keep if year == `YEAR'

quietly count if africa == 1
local ok = (r(N) == 54)
check `ok' "54 African economies in the World Bank list (found `r(N)')"

quietly count if africa == 1 & !missing(yu)
local n_est = r(N)
local ok = (`n_est' == 51)
check `ok' "51 African economies have a `YEAR' youth unemployment estimate (found `n_est')"
display as text "      Without an estimate:"
list iso3 countryname if africa == 1 & missing(yu), noobs clean

quietly summarize yu if iso3 == "FRA"
local fra = r(mean)
quietly summarize yu if five == 1
local ok = (abs(r(max) - `fra') < 1e-9)
check `ok' "France has the highest rate of the five WSJ countries (France = `: display %5.2f `fra'')"
list iso3 yu if five == 1, noobs clean

quietly count if africa == 1 & !missing(yu) & yu > `fra'
local n_above = r(N)
local ok = (`n_above' == 16)
check `ok' "16 African countries above France (found `n_above')"
* Sensitivity: how close is the nearest country to France's rate?
gen double gap_fra = abs(yu - `fra') if africa == 1
quietly summarize gap_fra
display as text "      Closest African country to France's rate is `: display %4.2f r(min)' points away"

quietly summarize yu if iso3 == "DEU"
local deu = r(mean)
display as text "      Protest countries below Germany (`: display %4.2f `deu''):"
list iso3 yu if protest == 1 & yu < `deu', noobs clean

foreach c in ZAF MDG {
    quietly summarize yu if iso3 == "`c'"
    display as text "      `c' youth unemployment: " %5.2f r(mean)
}
quietly summarize ve if iso3 == "MDG"
display as text "      MDG vulnerable employment: " %5.2f r(mean)
quietly summarize ve if iso3 == "USA"
display as text "      USA vulnerable employment: " %5.2f r(mean)

* Under-15 shares: Sub-Saharan Africa (SSF) and European Union (EUU) aggregates
foreach c in SSF EUU WLD {
    quietly summarize u15 if iso3 == "`c'"
    display as text "      `c' population under 15: " %5.2f r(mean)
}

* Ranking behind the text on where the highest and lowest rates are
gsort -yu
display as text _n "African countries ranked by youth unemployment, `YEAR':"
list iso3 countryname yu if africa == 1 & !missing(yu), noobs clean
tempfile y2025
save `y2025'

*------------------------------------------------------------------------------
* 3. Published snapshot vs fresh data
*------------------------------------------------------------------------------
getpub countries_latest.csv
import delimited "pub_countries_latest.csv", clear varnames(1) encoding("utf-8") stringcols(_all)
destring youth_unemployment vulnerable_employment under15_share, replace
rename (youth_unemployment vulnerable_employment under15_share) (pub_yu pub_ve pub_u15)
keep iso3 group pub_yu pub_ve pub_u15
merge 1:1 iso3 using `y2025', keep(master match)
quietly count if _merge == 1
local ok = (r(N) == 0)
check `ok' "Every published country found in fresh World Bank data"

foreach v in yu ve u15 {
    gen double d_`v' = abs(pub_`v' - `v') if !missing(pub_`v')
    quietly count if d_`v' > `TOL' & !missing(d_`v')
    local nm = r(N)
    local ok = (`nm' == 0)
    check `ok' "Published `v' matches fresh data within rounding (`nm' mismatches)"
    if `nm' list iso3 pub_`v' `v' if d_`v' > `TOL' & !missing(d_`v'), noobs clean
}
quietly count if group != "WSJ chart"
local ok = (r(N) == `n_est')
check `ok' "Published file has all `n_est' African countries with estimates"

*------------------------------------------------------------------------------
* 4. Published time series vs fresh data
*------------------------------------------------------------------------------
getpub trend_all.csv
import delimited "pub_trend_all.csv", clear varnames(1) encoding("utf-8") stringcols(_all)
destring year youth_unemployment, replace
rename youth_unemployment pub_yu
keep iso3 year pub_yu
merge 1:1 iso3 year using `wb', keep(master match) keepusing(yu)
quietly count if _merge == 1
local ok = (r(N) == 0)
check `ok' "Every published country-year found in fresh data"
gen double d = abs(pub_yu - yu)
quietly count if d > `TOL' & !missing(d)
local nm = r(N)
local ok = (`nm' == 0)
check `ok' "Published 1991-`YEAR' series matches fresh data within rounding (`nm' mismatches of `=_N')"
if `nm' list iso3 year pub_yu yu if d > `TOL' & !missing(d), noobs clean

*------------------------------------------------------------------------------
* 5. Population under 15 file
*------------------------------------------------------------------------------
getpub under15.csv
import delimited "pub_under15.csv", clear varnames(1) encoding("utf-8") stringcols(_all)
destring under15_share, replace
rename (code under15_share) (iso3 pub_u15)
merge 1:1 iso3 using `y2025', keep(master match) keepusing(u15)
gen double d = abs(pub_u15 - u15)
quietly count if d > `TOL' & !missing(d)
local ok = (r(N) == 0)
check `ok' "Published under-15 shares match fresh data within rounding"
list iso3 pub_u15 u15, noobs clean

foreach fn in countries_latest.csv trend_all.csv under15.csv {
    capture erase "pub_`fn'"
}
display as text _n "Done. A FAIL after a World Bank revision is expected until the monthly refresh is merged."
log close
