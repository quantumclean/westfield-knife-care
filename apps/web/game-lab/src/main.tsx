/**
 * The Edge Returns: game-lab prototype entry. Deliberately separate from the
 * site's src/main.tsx: no session, analytics, booking or API code is loaded.
 */
import { render } from "preact";
import "@fontsource/instrument-serif/latin-400.css";
import "./game.css";
import { GameLab } from "./GameLab.tsx";

const root = document.getElementById("game");
if (root) render(<GameLab params={new URLSearchParams(location.search)} />, root);
