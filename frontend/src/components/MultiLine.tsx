import { Fragment } from "react";

/** Renders the "\n" line breaks of a text.json string as <br />. */
export function MultiLine({ text }: { text: string }) {
    return text.split("\n").map((line, index) => (
        <Fragment key={index}>
            {index > 0 && <br />}
            {line}
        </Fragment>
    ));
}
