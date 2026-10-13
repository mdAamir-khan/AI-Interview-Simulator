# Auto-Submit on 3 Warnings + Fresh Session Reset - TODO

## Goal
When warning count reaches 3: automatically submit the interview, save all responses, and end the current session. Clear/reset any browser session state, warning counters, and temporary data so a new interview in the same browser starts as a fresh session with no previous state or restrictions.

## Steps

- [x] 1. Remove the permanent `interview_blocked` restriction block at page load in `public/index.html`
- [x] 2. Add defensive cleanup on page load (clear stale `interview_blocked` key + `sessionStorage`) in `public/index.html`
- [x] 3. Update `handleProctoringDisqualification()`:
  - Remove `localStorage.setItem("interview_blocked", "true")`
  - Capture any in-progress answer from the answer box into `state.allAnswers` before auto-submitting
  - Keep auto-submission + session ending logic
- [x] 4. Update `restartBtn` handler:
  - Add `localStorage.removeItem("interview_blocked")` + `sessionStorage.clear()`
  - Reset `state.recognition = null` after aborting it
- [ ] 5. Restart the Node.js server (`npm start`) and test the proctoring flow end-to-end
  - Requires a webcam + valid `OPENROUTER_API_KEY` in `.env`
  - Test: trigger 3 warnings → verify answers are auto-submitted, session ends, scorecard renders, and "Start New Interview" starts a fresh session

## Files Edited
- `public/index.html` — all changes applied

