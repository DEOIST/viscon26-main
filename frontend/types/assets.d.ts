// Ambient declarations so TypeScript understands non-TS imports. No domain types here —
// those live in src/misc/CommonInt.ts.

declare module "*.module.css" {
    const classes: { readonly [className: string]: string };
    export default classes;
}

declare module "*.css";

// Image/font imports resolve to a URL string (esbuild "file" loader, see build.js).
declare module "*.png" {
    const url: string;
    export default url;
}
declare module "*.jpg" {
    const url: string;
    export default url;
}
declare module "*.jpeg" {
    const url: string;
    export default url;
}
declare module "*.gif" {
    const url: string;
    export default url;
}
declare module "*.webp" {
    const url: string;
    export default url;
}
declare module "*.svg" {
    const url: string;
    export default url;
}
declare module "*.woff2" {
    const url: string;
    export default url;
}

// Audio imports also resolve to a URL string (esbuild "file" loader).
declare module "*.mp3" {
    const url: string;
    export default url;
}
declare module "*.ogg" {
    const url: string;
    export default url;
}
declare module "*.wav" {
    const url: string;
    export default url;
}
declare module "*.m4a" {
    const url: string;
    export default url;
}
