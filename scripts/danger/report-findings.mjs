export function reportFindings(results, reporters) {
  for (const message of results.failures) {
    reporters.fail(message);
  }

  for (const message of results.warnings) {
    reporters.warn(message);
  }
}
