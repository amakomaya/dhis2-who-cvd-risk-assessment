/**
 * mapOptionCode: a generic, config-driven lookup - option-code mappings
 * themselves live only in the DataStore configuration
 * (inputSettings.*.optionCodeMapping), never hardcoded here, so a
 * deployment change never requires a code change.
 *
 * Reference only (confirmed against erecord.hmis.gov.np/tokha, program
 * RWD4kcdpe0E, and mirrored exactly in
 * config/nepal-tokha-datastore-configuration.json's optionCodeMapping
 * fields - the actual source of truth for this deployment):
 *
 * Tobacco use (data element D3eRPeASNXl, option set gn2VJOOzl5R):
 *   1  नगर्ने       (does not use)     -> non-smoker
 *   2  नियमित       (regular user)     -> smoker
 *   3  कहिलेकाहिँ    (occasional user)  -> smoker
 *   4  विगतमा गर्ने  (used to, past)    -> non-smoker
 *
 * Diabetes (data element H148aekqr5U, option set oq2dw7GhNLw):
 *   1  छ     (has diabetes)       -> with
 *   0  छैन   (does not have)      -> without
 *
 * Sex (tracked entity attribute RzyHxE71iyC):
 *   male    पुरुष (M) -> male
 *   female  महिला (F) -> female
 */
/** Looks up a code in a mapping table; returns undefined (never a guessed default) when unmapped. */
export function mapOptionCode<T extends string>(
  table: Record<string, T>,
  code: string | undefined | null,
): T | undefined {
  if (code === undefined || code === null) return undefined;
  return table[code];
}
