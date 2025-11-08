export function classNames(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}

