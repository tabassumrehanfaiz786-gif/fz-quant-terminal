<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Trading strategy rules live in the pure engine src/lib/strategy.ts (covered by strategy.test.ts); UI and the Binance feed hook only call into it, so rules stay testable.
- Order-book synchronization, snapshots, and wall detection live in the pure src/lib/order-book.ts module with unit tests; the independent depth hook never changes trading decisions.
- Resting-liquidity history is a bounded browser-session timeline built only from synchronized live Binance spot snapshots; reconnects leave unsampled gaps rather than inventing historical liquidity.
