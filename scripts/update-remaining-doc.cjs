const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '..', 'docs', 'REMAINING_IMPLEMENTATION.md');
let s = fs.readFileSync(filePath, 'utf8');

// §3: replace the Steps bullet and Left to do
const section3Old = /(\*\*Steps:\*\*) There are no[\s\S]*?by some other path\.\s*\n\s*\n\*\*Left to do \(optional\):\*\*\s*\n\s*\n- Add[\s\S]*?from the UI\./;
const section3New = '$1 steps/runWorkflow/ and steps/loop/ exist (handler, step.json, sidepanel) and are in the step registry; users can add Run workflow and Loop from the Add step dropdown.\n\n**Done.**';
if (section3Old.test(s)) {
  s = s.replace(section3Old, section3New);
  console.log('Updated §3');
} else {
  console.log('§3 pattern not found');
}

// §4: replace the Current state paragraph and Left to do
const section4Old = /(- )Rows are supplied via the sidepanel: paste[\s\S]*?script\.\s*\n\s*\n\*\*Left to do:\*\*\s*\n\s*\n- Define a messaging API[\s\S]*?runs\./;
const section4New = "- Messaging API is implemented and documented in docs/PROGRAMMATIC_API.md: SET_IMPORTED_ROWS and RUN_WORKFLOW (with optional autoStart: 'all' | 'current').\n\n**Done.**";
if (section4Old.test(s)) {
  s = s.replace(section4Old, section4New);
  console.log('Updated §4');
} else {
  console.log('§4 pattern not found');
}

// §8: update Workflow Q&A current state
const section8Old = /\*\*Current state:\*\* Product\/backend vision only[\s\S]*?add credits later\./;
const section8New = '**Current state:** Q&A UI implemented with mock backend (local storage). Sidepanel tab "Q&A": ask a question (optional "This site only"), search returns answers (workflows) sorted by thumbs up minus thumbs down; thumbs up/down; if no results, submit the question; "Answer a question" lists questions with few answers, link a workflow as answer. Each result: Run once, Run all rows, Schedule, View tutorial. Real backend and credits for top answerers still to come.';
if (section8Old.test(s)) {
  s = s.replace(section8Old, section8New);
  console.log('Updated §8');
} else {
  console.log('§8 pattern not found');
}

fs.writeFileSync(filePath, s);
