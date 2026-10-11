/**
 * tests/verifyCommandRecovery.js - Automated Test Suite for Command-Recovery Flow
 */

import { levenshteinDistance, getCommandSuggestions, REGISTERED_COMMANDS } from '../src/js/voice/levenshtein.js';
import { CommandParser } from '../src/js/voice/commandParser.js';
import { metricsStore, logRecoveryEvent, getRecoveryMetrics } from '../src/js/metrics.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('--- Test Suite 1: Levenshtein Distance & Fuzzy Suggestions ---');

// 1. Distance tests
assert(levenshteinDistance('scroll down', 'scroll down') === 0, 'Exact match distance is 0');
assert(levenshteinDistance('scrol down', 'scroll down') === 1, '"scrol down" to "scroll down" distance is 1');
assert(levenshteinDistance('clik', 'click') === 1, '"clik" to "click" distance is 1');
assert(levenshteinDistance('go bck', 'go back') === 1, '"go bck" to "go back" distance is 1');
assert(levenshteinDistance('opn search', 'open search') === 1, '"opn search" to "open search" distance is 1');

// 2. Suggestions tests
const sugsScroll = getCommandSuggestions('scrol down');
assert(sugsScroll.length === 3, 'Returns 3 suggestions for "scrol down"');
assert(sugsScroll[0].command === 'scroll down', 'Top suggestion for "scrol down" is "scroll down"');
assert(sugsScroll[0].distance === 1, 'Distance of top suggestion is 1');

const sugsClick = getCommandSuggestions('clik');
assert(sugsClick[0].command === 'click', 'Top suggestion for "clik" is "click"');

const sugsSearch = getCommandSuggestions('opn search');
assert(sugsSearch[0].command === 'open search', 'Top suggestion for "opn search" is "open search"');

console.log('\n--- Test Suite 2: CommandParser Exact Match Detection ---');

const parser = new CommandParser();
assert(parser.hasExactMatch('scroll down') === true, 'Matches "scroll down"');
assert(parser.hasExactMatch('scroll up') === true, 'Matches "scroll up"');
assert(parser.hasExactMatch('click') === true, 'Matches "click"');
assert(parser.hasExactMatch('go back') === true, 'Matches "go back"');
assert(parser.hasExactMatch('open search') === true, 'Matches "open search"');
assert(parser.hasExactMatch('search') === true, 'Matches "search"');
assert(parser.hasExactMatch('click 3') === true, 'Matches "click 3"');
assert(parser.hasExactMatch('show links') === true, 'Matches "show links"');

// Non-exact triggers
assert(parser.hasExactMatch('scrol down') === false, 'Rejects typo "scrol down"');
assert(parser.hasExactMatch('clik') === false, 'Rejects typo "clik"');
assert(parser.hasExactMatch('random conversation') === false, 'Rejects non-command text');
assert(parser.hasExactMatch('go bck') === false, 'Rejects typo "go bck"');

console.log('\n--- Test Suite 3: Metrics Store Telemetry Logging ---');

metricsStore.clear();
assert(metricsStore.getEvents().length === 0, 'Metrics store cleared successfully');

// Log misheard
const misheardEntry = logRecoveryEvent('misheard', {
  transcript: 'scrol down',
  confidence: 0.65,
  suggestions: ['scroll down', 'scroll up', 'scroll top']
});
assert(misheardEntry.type === 'misheard', 'Recorded misheard event type');
assert(misheardEntry.timestamp > 0, 'Has valid timestamp');
assert(misheardEntry.confidence === 0.65, 'Preserved confidence score');

// Log corrected
const startTime = Date.now() - 1450;
const correctedEntry = logRecoveryEvent('corrected', {
  originalTranscript: 'scrol down',
  chosenCommand: 'scroll down',
  recoveryTimeMs: Date.now() - startTime,
  method: 'voice'
});
assert(correctedEntry.type === 'corrected', 'Recorded corrected event type');
assert(correctedEntry.chosenCommand === 'scroll down', 'Recorded chosen command');
assert(correctedEntry.recoveryTimeMs >= 1450, 'Recorded recovery latency');

// Log dismissed (timeout)
const dismissedEntry = logRecoveryEvent('dismissed', {
  originalTranscript: 'random babble',
  reason: 'timeout',
  elapsedMs: 6000
});
assert(dismissedEntry.type === 'dismissed', 'Recorded dismissed event type');
assert(dismissedEntry.reason === 'timeout', 'Recorded dismissal reason as timeout');

// Log dismissed (none of these)
const noneEntry = logRecoveryEvent('dismissed', {
  originalTranscript: 'unwanted action',
  reason: 'none_of_these',
  elapsedMs: 1200
});
assert(noneEntry.reason === 'none_of_these', 'Recorded dismissal reason as none_of_these');

const allRecovery = getRecoveryMetrics();
assert(allRecovery.misheard.length === 1, 'Retrieved 1 misheard event');
assert(allRecovery.corrected.length === 1, 'Retrieved 1 corrected event');
assert(allRecovery.dismissed.length === 2, 'Retrieved 2 dismissed events');

console.log('\n--- Test Suite 4: Command Parser Execution Integration ---');

let executedAction = null;
let executedPayload = null;

const testParser = new CommandParser({
  onCommandMatched: (cmd) => {
    executedAction = cmd.action;
    executedPayload = cmd.payload;
  }
});

testParser.parse('scroll down');
assert(executedAction === 'SCROLL' && executedPayload?.direction === 'down', 'Executing "scroll down" emits SCROLL down');

testParser.parse('open search');
assert(executedAction === 'TRIGGER_SEARCH', 'Executing "open search" emits TRIGGER_SEARCH');

testParser.parse('click');
assert(executedAction === 'CLICK_CURRENT_POINTER', 'Executing "click" emits CLICK_CURRENT_POINTER');

testParser.parse('go back');
assert(executedAction === 'NAVIGATE_BACK', 'Executing "go back" emits NAVIGATE_BACK');

console.log(`\n========================================`);
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
