// One Minecraft-style health heart, drawn pixel by pixel; the Year 1 intro shows five.

// X outline, R fill, W highlight.
const PIXELS = [
    ".XX...XX.",
    "XRRX.XRRX",
    "XRWRXRRRX",
    "XRRRRRRRX",
    "XRRRRRRRX",
    ".XRRRRRX.",
    "..XRRRX..",
    "...XRX...",
    "....X....",
];
const OUTLINE = "#1a0a0a";
const FULL = { R: "#e3262e", W: "#ffb3b3" };
const EMPTY = { R: "#3b1416", W: "#3b1416" };

interface PixelHeartArgs {
    fill: "full" | "half" | "empty";
}

export default function PixelHeart(args: PixelHeartArgs) {
    return (
        <svg viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden="true">
            {PIXELS.flatMap((row, y) =>
                [...row].map((pixel, x) => {
                    if (pixel === ".") return null;
                    const lit =
                        args.fill === "full" ||
                        (args.fill === "half" && x <= 4);
                    const color =
                        pixel === "X"
                            ? OUTLINE
                            : (lit ? FULL : EMPTY)[pixel as "R" | "W"];
                    return (
                        <rect
                            key={`${x}-${y}`}
                            x={x}
                            y={y}
                            width="1"
                            height="1"
                            fill={color}
                        />
                    );
                }),
            )}
        </svg>
    );
}
