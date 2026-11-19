# Africa youth data: monthly refresh with review

This folder holds the data behind "Africa's Youth Unemployment" (africa-youth.html) and documents its reviewed monthly refresh.

## What is involved

| Path | What it does |
|---|---|
| `scripts/update_africa_youth.py` | Downloads four World Bank indicators and rebuilds the CSV files. Standard-library Python, no installs. |
| `.github/workflows/refresh-africa-youth-data.yml` | Runs the script on the 3rd of each month and opens a pull request with the changes. Never publishes by itself. |
| `africa-youth.html`, `africa-youth.js` | The article page and the script that draws its charts from the files below. |
| `data/africa-youth/trend_all.csv` | Youth unemployment, 1991 to latest year, every African country with data plus France, China, U.K., U.S. and Germany. |
| `data/africa-youth/countries_latest.csv` | Latest-year snapshot: youth unemployment, vulnerable employment, NEET rate and under-15 share. |
| `data/africa-youth/under15.csv` | Share of population under 15 for Sub-Saharan Africa and comparison places. |
| `data/africa-youth/protests.csv` | Hand-curated protest log. The script never touches it; edit it by hand after verifying each row. |
| `data/africa-youth/meta.json` | When the data was refreshed, the World Bank's own last-updated dates, and every figure the article text quotes. |
| `data/africa-youth/CHANGES.md` | Plain-language summary of what changed. It becomes the pull request description. |

## One-time setup in the website repository

The files are already in place. One setting has to be turned on by hand:

1. In the repository on GitHub, open **Settings > Actions > General**. Under "Workflow permissions", choose **Read and write permissions** and tick **Allow GitHub Actions to create and approve pull requests**. Save.
2. Open the **Actions** tab, choose **Refresh Africa youth data**, and click **Run workflow** once to confirm it works.

## Monthly review

When the World Bank revises its estimates, a pull request titled "Data refresh: Africa youth labor indicators" appears. If nothing changed, no pull request is opened.

1. Read the description. The section "Figures quoted in the article text" lists any headline number that moved.
2. If a headline number moved, update the matching sentence in the article before merging. For example, if the count of countries above France changes from 16 to 15, the article must say 15.
3. Merge. GitHub Pages republishes the site within a few minutes.

## Notes

- The World Bank API is sometimes slow or returns errors. The script retries with growing pauses. If it still fails, the workflow run shows as failed, nothing is changed, and you can rerun it from the Actions tab.
- The script asks for data through the previous calendar year. ILO estimates lag by about a year, and requests that include the current year can stall.
- World Bank data is published under the Creative Commons Attribution 4.0 license. Keep the source line under every chart.
