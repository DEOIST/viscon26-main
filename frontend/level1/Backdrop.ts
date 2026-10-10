// A restrained editor backdrop: scrolling syntax-colored code, quiet chrome and a minimap.
import { GAME_HEIGHT, GAME_WIDTH } from "./gameSize";
import type { GameObjects, Scene } from "phaser";

const CALM = 0x648fc6;
const HOT = 0xa48bbf;
const ALARM = 0xd97278;
const ROW_HEIGHT = 31;
const CODE: [string, string][] = [
    ["// a little focus. a little less chaos.", "#667b75"],
    ["import { build, deploy } from './workspace';", "#a590c2"],
    ["", "#8994a6"],
    ["export async function shipRelease() {", "#8faecc"],
    ["  const project = await workspace.open();", "#adb6c5"],
    ["  const release = build(project);", "#adb6c5"],
    ["", "#8994a6"],
    ["  // remove anything that shouldn't be here", "#667b75"],
    ["  for (const bug of release.bugs) {", "#a590c2"],
    ["    await bug.remove();", "#b6a886"],
    ["  }", "#8994a6"],
    ["", "#8994a6"],
    ["  const checks = await release.validate();", "#adb6c5"],
    ["  if (checks.passed) {", "#a590c2"],
    ["    protect(release.workingCode);", "#8ba99b"],
    ["    await deploy(release);", "#8faecc"],
    ["  }", "#8994a6"],
    ["", "#8994a6"],
    ["  return { status: 'ready to ship' };", "#b6a886"],
    ["}", "#8994a6"],
    ["", "#8994a6"],
    ["// keep going. you're making progress.", "#667b75"],
];

export interface Mood {
    streak: number;
    isFinalStretch: boolean;
    isAdvancing?: boolean;
}

export default class Backdrop {
    private readonly graphics: GameObjects.Graphics;
    private readonly rows: {
        code: GameObjects.Text;
        number: GameObjects.Text;
    }[] = [];
    private readonly progress: GameObjects.Text;
    private distance = 0;
    private energy = 0;
    private flash = CALM;

    constructor(scene: Scene) {
        this.graphics = scene.add.graphics().setDepth(-20);
        const label = (
            x: number,
            y: number,
            text: string,
            size: number,
            color: string,
        ) =>
            scene.add
                .text(x, y, text, {
                    fontFamily: "monospace",
                    fontSize: `${size}px`,
                    color,
                })
                .setDepth(-19);
        // The game's title occupies the top bar; keep the editor chrome below it.
        label(26, 66, "WORKSPACE", 11, "#69788f");
        label(26, 115, "⌄  bug-bash", 13, "#a7b2c3");
        label(39, 156, "⌄ src", 12, "#7e8ba1");
        label(54, 191, "main.ts", 12, "#b1c0d3");
        label(54, 222, "bugs.ts", 12, "#718198");
        label(54, 253, "release.ts", 12, "#718198");
        label(39, 296, "› tests", 12, "#718198");
        label(39, 331, "package.json", 12, "#718198");
        label(215, 64, "TS", 12, "#79a1cc");
        label(244, 64, "main.ts", 13, "#c3cbd8");
        label(362, 64, "bugs.ts", 13, "#647189");
        label(213, 97, "src  /  main.ts  /  shipRelease", 11, "#55647b");
        const clip = scene.make.graphics({ x: 0, y: 0 });
        clip.fillStyle(0xffffff).fillRect(195, 121, 950, 445);
        const mask = clip.createGeometryMask();
        for (let row = 0; row < 17; row += 1) {
            const code = label(256, 130, "", 16, "#9aa7b8").setMask(mask);
            const number = label(213, 130, "", 12, "#435168")
                .setOrigin(1, 0)
                .setMask(mask);
            this.rows.push({ code, number });
        }
        scene.events.once("shutdown", () => {
            mask.destroy();
            clip.destroy();
        });
        label(214, 590, "TERMINAL", 10, "#8293aa");
        label(310, 590, "OUTPUT", 10, "#46576f");
        label(214, 620, "› watching workspace for changes", 12, "#6d9684");
        this.progress = label(968, 591, "line 1", 11, "#62758e");
        label(21, GAME_HEIGHT - 20, "main  ·  TypeScript", 10, "#8a9cb2");
        label(
            GAME_WIDTH - 188,
            GAME_HEIGHT - 20,
            "UTF-8     LF     TS",
            10,
            "#667c97",
        );
    }

    pulse(_x: number, _y: number, color: number, strength: number) {
        this.energy = Math.min(1, this.energy + strength);
        this.flash = color;
    }

    update(deltaMs: number, mood: Mood) {
        this.energy *= 0.5 ** (deltaMs / 220);
        if (mood.isAdvancing) this.distance += (deltaMs / 1000) * 12;
        const line = Math.floor(this.distance / ROW_HEIGHT);
        const offset = this.distance % ROW_HEIGHT;
        this.rows.forEach(({ code, number }, index) => {
            const [text, color] = CODE[(line + index) % CODE.length];
            const y = 128 + index * ROW_HEIGHT - offset;
            // Code remains legible and parallel; advancing through the file supplies motion.
            code.setText(text)
                .setColor(color)
                .setPosition(256, y)
                .setAlpha(0.42);
            number
                .setText(String(line + index + 1))
                .setPosition(234, y)
                .setAlpha(0.7);
        });
        this.progress.setText(`line ${line + 1}   →`);
        const g = this.graphics;
        g.clear();
        g.fillStyle(0x0c111b).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        g.fillStyle(0x141c29).fillRect(0, 0, GAME_WIDTH, 46);
        g.fillStyle(0x101723).fillRect(0, 46, 180, GAME_HEIGHT - 46);
        g.fillStyle(0x111925).fillRect(181, 46, GAME_WIDTH - 181, 42);
        g.fillStyle(0x172335).fillRect(194, 46, 140, 42);
        g.fillStyle(0x709cc3).fillRect(194, 86, 140, 2);
        g.fillStyle(0x1a293d, 0.6).fillRoundedRect(30, 180, 136, 30, 4);
        g.lineStyle(1, 0x202c3f, 0.7);
        g.lineBetween(180, 46, 180, GAME_HEIGHT - 28);
        g.lineBetween(181, 576, GAME_WIDTH, 576);
        g.fillStyle(0x0d1420).fillRect(181, 577, GAME_WIDTH - 181, 75);
        g.fillStyle(0x142035).fillRect(0, GAME_HEIGHT - 28, GAME_WIDTH, 28);
        // A subdued editor minimap and a travelling scrollbar, rather than perspective wires.
        for (let row = 0; row < 70; row += 1) {
            const width = 12 + ((row * 19) % 45);
            g.fillStyle(row % 4 === 0 ? 0x768e83 : 0x697c99, 0.13);
            g.fillRect(1178 + (row % 3) * 4, 125 + row * 5.4, width, 2);
        }
        g.fillStyle(0x8fa5c5, 0.15);
        g.fillRoundedRect(1268, 128 + ((this.distance * 0.17) % 280), 4, 78, 2);
        g.fillStyle(
            mood.isFinalStretch ? ALARM : this.flash,
            this.energy * 0.045,
        );
        g.fillRect(181, 89, GAME_WIDTH - 181, 487);
    }
}

export function moodColor(streak: number, alarm: number): number {
    return mixColor(
        mixColor(CALM, HOT, Math.min(1, Math.max(0, streak) / 8)),
        ALARM,
        alarm,
    );
}

export function mixColor(from: number, to: number, t: number): number {
    const amount = Math.min(1, Math.max(0, t));
    let mixed = 0;
    for (const shift of [16, 8, 0]) {
        const a = (from >> shift) & 0xff;
        const b = (to >> shift) & 0xff;
        mixed |= Math.round(a + (b - a) * amount) << shift;
    }
    return mixed;
}
