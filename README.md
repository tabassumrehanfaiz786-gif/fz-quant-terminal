# Fz Quant Terminal

Build an automated BTCUSDT paper trading terminal based on my strategy:
- Paper trading first with a virtual balance, real-time simulated order execution, and live Binance feed.
- Strategy:
  - Enter trades around the $10k levels of BTCUSDT (e.g. 60k, 70k, 80k, 90k, 100k) with $50,000 position size per trade.
  - Trade direction: Bounce / mean-reversion at 10k levels with sweep-and-reclaim confirmation, trade-flow/CVD absorption clues, and regime filtering.
  - Stop loss: structure stop capped at $2,500 distance above or below entry; move stop to break-even after +$2,500.
  - Profit exit: tiered profit target with partial exit and runner to the next 10k level.
  - Re-entry control: avoid entering repeatedly while a position is open; require a clean level retest before re-entering.
- Include a comparison switch between the Institutional Sweep & Reclaim mode and the basic 10k Touch mode.
- Interactive chart showing candles, 10k institutional levels, trade markers, and sweep/reclaim zones.
- Real-time PnL tracking, win rate, equity curve, open position manager, and an algorithmic risk and compliance audit log.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://fz-quant-terminal.lovable.app

## GitHub

Repository: [github.com/your-username/fz-quant-terminal](https://github.com/your-username/fz-quant-terminal)

> Replace the link above with your actual GitHub repository URL after connecting the project.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/39124d3b-7361-440f-8408-bd3d59570768).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone https://github.com/your-username/fz-quant-terminal.git
cd fz-quant-terminal
npm i
npm run dev