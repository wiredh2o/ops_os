# Stop unexpected screen resets while filling forms

## What the user sees
While typing in a form (or with the Diagnose window open), the screen suddenly "refreshes", entries vanish and the repair timer restarts.

## Likely causes (confirmed in code, exact trigger not yet reproduced)
1. **Coming back to the browser tab re-pulls all data.** The app's data loader uses default settings, so every time you switch windows and return, every list reloads. Many forms copy that data into their fields when it arrives, wiping what you typed. Open windows tied to that data can close and reopen, restarting the timer.
2. **Background sign-in refresh.** Sign-in renews itself roughly hourly and when you return to the tab. Each renewal replaces the signed-in user in memory, which makes screens that watch it re-run their setup.
3. **Hard reloads.** Two places call a full page reload (the error screen button and the permissions screen); an error mid-form shows the "Something went wrong" screen.

## Fix
1. Turn off automatic reload-on-tab-return app-wide, and keep loaded data fresh for a reasonable time; lists still update after saves as they do now.
2. Only update the signed-in user when the account actually changes (sign in / sign out / different user), ignoring routine renewals.
3. Never swap the whole screen for "Loading..." once it has loaded the first time; background re-checks happen silently.
4. Protect open forms: forms (customer, order, diagnose/repair, shipping, settings) only fill their fields from saved data when first opened, not every time data reloads.
5. Diagnose / repair window: keep the timer session alive if the window's data reloads; only stop it when the technician closes the window.
6. Add a small test for rules 2 and 3.

## Verification
- Automated tests for the sign-in and loading rules.
- Browser check of public screens; signed-in check isn't possible here, so you'd confirm by opening Diagnose, switching tabs for a minute, and returning.

## Technical details
- `new QueryClient()` in App.tsx → defaults `refetchOnWindowFocus: false`, `staleTime: 60s`.
- `useAuth`: compare `session?.user?.id` before `setUser`; ignore `TOKEN_REFRESHED` user replacement; memoize context value.
- `Index.tsx` / `useStaffTabPermissions`: gate on `isPending` of first load only (already) and ensure roles query `staleTime` not 0 to avoid refetch flicker.
- Audit `useEffect(() => setForm(...), [data])` patterns in modals; guard with an "initialized for this record id" ref.
- `useRepairTimer`: depend on item id only, not object identity.
