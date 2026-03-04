const URL_REGEX =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;

type Replacements = {
  url: string;
  startIndex: number;
  endIndex: number;
  replacementText?: string;
};

const findURLIndices = (text: string) => {
  const matches = [...text.matchAll(URL_REGEX)];
  return matches.map(
    (match) =>
      ({
        url: match[0],
        startIndex: match.index,
        endIndex: match.index + match[0].length - 1,
      }) as Replacements,
  );
};

const replaceTextByIndices = (
  originalText: string,
  replacements: Replacements[],
) => {
  let result = "";
  let lastIndex = 0;

  // Sort replacements by startIndex to handle them in order
  replacements.sort((a, b) => a.startIndex - b.startIndex);

  for (const { startIndex, endIndex, replacementText } of replacements) {
    // Append text before the current replacement
    result += originalText.slice(lastIndex, startIndex);
    // Append the replacement text
    result += replacementText;
    // Update lastIndex to after the replaced segment
    lastIndex = endIndex + 1;
  }

  // Append any remaining text after the last replacement
  result += originalText.slice(lastIndex);

  return result;
};

export const renderText = (txt: string) => {
  const urlIndices = findURLIndices(txt);

  return (
    <p
      dangerouslySetInnerHTML={{
        __html: replaceTextByIndices(
          txt,
          urlIndices.map((el) => {
            el["replacementText"] =
              `<a key=${el.url} href=${el.url} style="text-decoration: underline;" target="_blank">
        ${el.url}
        </a>`;
            return el;
          }),
        ),
      }}
    ></p>
  );
};
