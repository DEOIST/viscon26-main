import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Avatar } from "./Avatar";
import { defaultPlayer } from "../store";

afterEach(cleanup);

const character = { ...defaultPlayer.character, glasses: "none" as const };

function draw(args: Partial<Parameters<typeof Avatar>[0]> = {}) {
    return render(<Avatar character={character} {...args} />).container;
}

it("keeps the builder's calm face by default", () => {
    const svg = draw();
    expect(svg.querySelectorAll("ellipse")).toHaveLength(2); // the eye whites
    expect(svg.innerHTML).not.toContain("#7a2638"); // no open mouth
});

it("closes the eyes for a blink and grins when happy", () => {
    expect(draw({ blinking: true }).querySelectorAll("ellipse")).toHaveLength(
        0,
    );
    const happy = draw({ expression: "happy" });
    expect(happy.innerHTML).toContain("#7a2638"); // the grin
    expect(happy.innerHTML).toContain("#ff7f9a"); // blushing cheeks
});

it("squeezes the eyes when hurt and adds tears when crying", () => {
    const hurt = draw({ expression: "hurt" });
    expect(hurt.querySelectorAll("ellipse")).toHaveLength(0);
    expect(hurt.innerHTML).not.toContain("#8fd3ff");
    expect(draw({ expression: "crying" }).innerHTML).toContain("#8fd3ff");
});
