# Product

## Register

product

## Users
Ander, a Minecraft Bedrock player, runs a server on his own Windows PC so friends on other networks can join. He opens the app on that PC, often at night and next to the game, to open or close the server, see who is inside, add friends, pick the world and keep backups. He is not a sysadmin: every screen has to make the next action obvious.

## Product Purpose
CraftAdmin (formerly "Posada") is a desktop app (Electron) that administers a Minecraft Bedrock Dedicated Server: start and stop it, the playit.gg tunnel and WaterdogPE entrance for friends, the allow list and roles, worlds, backups, a live console and server settings. Success is that Ander opens the server and shares the address in seconds, and always knows if friends can get in.

## Brand Personality
Solid, capable, unmistakably Minecraft. It should feel like an official Minecraft product (the Minecraft Launcher, Bedrock's current menus), not a fan-made toy. Calm and confident; Spanish copy, neutral register, short and concrete.

## Anti-references
- Cheap or childish game looks: pixel fonts for UI text, dirt or stone tiled backgrounds everywhere, cartoon landscapes, beveled retro Java menu screens. (Two previous versions were rejected for this: one "generic", one "horrible".)
- Generic SaaS dashboards: rows of identical cards, big-number hero metrics, gradient accents.
- Hand-drawn imitations of Minecraft art. Ander rejected them twice (procedural textures, then hand-made 16x16 ones): icons must come straight from the game.
- Restyling the whole app when he asked for specific fixes. A grey version built from Bedrock's menu button pieces was rejected ("no te pedí cambiar de diseño"): keep the dark launcher look and change only what he asks.
- Drop shadows, glows, outlined panels and heavy borders ("sombras feas, bordes muy marcados"). Surfaces separate by tone only.

## Design Principles
1. Official, not fan-made: borrow the structure and confidence of Minecraft's own apps (chunky flat buttons with a darker bottom lip, green primary, square corners). All block textures, default skins, UI icons and fonts are the real ones from the Bedrock install on his PC (`tools/texturas.py` writes `renderer/juego.js`, `renderer/ore.css` and `renderer/fonts`; the app is for his personal use only, never distributed). UI text uses the game's current menu fonts: Minecraft Seven for text (18px, crisp), Minecraft Ten for titles.
2. Block icons are 3D cubes shaped like the game's inventory (yaw 45°, pitch 30°: 2:1 top, vertical edges 1.22x), never flattened or squat and never flat faces. Same for the app icon (`tools/icono.py`).
3. One integrated top bar: brand, sections as hotbar slots (the chosen one sits on a sliding green block), server status and the window buttons. No sidebar. Content uses the full width and height of the window.
4. Nothing with the operating system's look: no native dropdowns (the app has its own menu), no focus outlines or white frames, green text selection.
5. His world is the hero: the user's real world screenshot, player heads and item icons carry the Minecraft identity; the chrome stays quiet.
6. One obvious next action per screen: open the server, copy the address, add a friend.
7. Status you can trust at a glance: open, opening, closed, ready for friends, errors, always visible and consistent.
8. Smooth, lively motion: the previous section fades while the new one cascades in, towers rise from the ground, friends drop onto the grass with a hop, numbers count up, the world photo pans slowly like the game's menu panorama.

## Accessibility & Inclusion
WCAG AA contrast for all text. Keyboard navigation (number keys switch sections). Respect reduced motion. No color-only status: every state also has text.
