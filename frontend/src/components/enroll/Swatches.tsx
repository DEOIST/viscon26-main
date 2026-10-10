import Icon from "../common/Icon";
import { shellClass } from "../../misc/shellStyles";
interface SwatchesArgs {
    label: string;
    value: string;
    colors: { label: string; value: string }[];
    onChange: (value: string) => void;
}
export default function Swatches(args: SwatchesArgs) {
    const { label, value, colors, onChange } = args;
    return (
        <fieldset className={shellClass("swatches")}>
            <legend>
                {label}{" "}
                <span>
                    {colors.find((color) => color.value === value)?.label}
                </span>
            </legend>
            <div className={shellClass("swatch-options")}>
                {colors.map((color) => (
                    <button
                        type="button"
                        className={shellClass(
                            `swatch ${value === color.value ? "selected" : ""}`,
                        )}
                        key={color.value}
                        aria-label={`${label}: ${color.label}`}
                        aria-pressed={value === color.value}
                        title={color.label}
                        onClick={() => onChange(color.value)}
                    >
                        <span
                            className={shellClass("swatch-color")}
                            style={{ backgroundColor: color.value }}
                        />
                        {value === color.value && (
                            <span className={shellClass("swatch-check")}>
                                <Icon name="check" size={12} />
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </fieldset>
    );
}
