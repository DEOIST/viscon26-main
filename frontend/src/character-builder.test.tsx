import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CharacterBuilder } from "./components/Screens";
import { departmentLabel, MAJOR } from "./config";
import { defaultPlayer, readGuest } from "./store";

afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe("simplified character builder", () => {
    it("offers only D-INFK while preserving the saved major and live appearance", () => {
        const onContinue = vi.fn();
        render(
            <CharacterBuilder
                player={{ ...defaultPlayer, name: "Ada", major: MAJOR }}
                busy={false}
                error=""
                onBack={vi.fn()}
                onContinue={onContinue}
            />,
        );
        const department = screen.getByLabelText(
            "Department",
        ) as HTMLSelectElement;
        expect(department.value).toBe("D-INFK");
        expect([...department.options].map((option) => option.text)).toEqual([
            "D-INFK",
        ]);
        expect(screen.queryByLabelText(/archetype/i)).toBeNull();
        fireEvent.click(
            screen.getByRole("button", { name: "Hair color: Copper red" }),
        );
        fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
        expect(onContinue).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Ada",
                major: MAJOR,
                onboardingStage: "acceptance",
                character: expect.objectContaining({ hairColor: "#B95836" }),
            }),
        );
    });

    it("saves gender and glasses, and draws the glasses", () => {
        const onContinue = vi.fn();
        render(
            <CharacterBuilder
                player={{ ...defaultPlayer, name: "Ada" }}
                busy={false}
                error=""
                onBack={vi.fn()}
                onContinue={onContinue}
            />,
        );
        const gender = screen.getByLabelText("Gender") as HTMLSelectElement;
        expect(gender.value).toBe("unspecified");
        fireEvent.change(gender, { target: { value: "nonbinary" } });
        const glasses = screen.getByLabelText("Glasses") as HTMLSelectElement;
        expect(glasses.value).toBe("none");
        expect(screen.queryByTestId("avatar-glasses")).toBeNull();
        fireEvent.change(glasses, { target: { value: "sunglasses" } });
        expect(screen.getByTestId("avatar-glasses")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Continue/ }));
        expect(onContinue).toHaveBeenCalledWith(
            expect.objectContaining({
                character: expect.objectContaining({
                    gender: "nonbinary",
                    glasses: "sunglasses",
                }),
            }),
        );
    });

    it("keeps guest saves from before the gender and glasses fields", () => {
        const {
            gender: _gender,
            glasses: _glasses,
            ...oldCharacter
        } = defaultPlayer.character;
        localStorage.setItem(
            "eth-simulator.guest.v1",
            JSON.stringify({
                version: 1,
                player: {
                    ...defaultPlayer,
                    name: "Ada",
                    onboardingStage: "main",
                    character: oldCharacter,
                },
                progress: { completedGameIds: [], graduated: false },
            }),
        );
        expect(readGuest().player).toMatchObject({
            name: "Ada",
            character: { gender: "unspecified", glasses: "none" },
        });
    });

    it.each([MAJOR, "D-INFK", "infk", "Computer Science (D-INFK)"])(
        "loads an existing %s profile without resetting data",
        (major) => {
            localStorage.setItem(
                "eth-simulator.guest.v1",
                JSON.stringify({
                    version: 1,
                    player: {
                        ...defaultPlayer,
                        name: "Ada",
                        major,
                        onboardingStage: "main",
                    },
                    progress: { completedGameIds: [], graduated: false },
                }),
            );
            expect(readGuest().player).toMatchObject({
                name: "Ada",
                major,
                onboardingStage: "main",
            });
            expect(departmentLabel(readGuest().player.major)).toBe("D-INFK");
        },
    );
});
