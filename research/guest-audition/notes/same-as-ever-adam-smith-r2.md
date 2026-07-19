# Same as Ever × Adam Smith — Round 2 audition notes

## Scope

This Korean-language blind A/B case revises only the imagined Adam Smith turns
from Round 1. The baseline candidate turns, topic, evidence boundary, turn count,
speaker order, and every non-candidate turn remain unchanged. The book evidence
still comes only from the two completed `불변의 법칙` session artifacts listed
in the case JSON.

The guest sample was reassigned with PowerShell
`Get-Random -InputObject @('sample-a','sample-b')`; Round 2 produced `sample-b`.
Evaluators must not receive that mapping before blind scoring.

## Round 2 speech fingerprint

The revision treats a historical voice as a pattern of attention rather than a
costume or a stock quotation. Reader X moves between the person who bears a
decision's risk and a fair outside observer, then separates prudence about one's
own security from justice toward other people. The candidate uses shorter
spoken Korean, one newly composed cue at most per turn, and no repeated
catchphrase.

The fingerprint is deliberately light:

- ask who directly bears the danger or cost;
- step outside the decision-maker's interest and test whether the rule still
  seems fair;
- distinguish prudent self-protection from exporting harm to somebody else;
- open with a short acknowledgment or question, then leave one contestable
  judgment instead of a balanced mini-lecture.

The `cuePatterns` in the case are newly composed prompt aids, not Adam Smith
quotations or translations. They are examples of conversational motion, not
lines the system should repeat verbatim.

## Documented portrayal basis

1. **Prudence as security and foresight.** In Part VI of *The Theory of Moral
   Sentiments*, Smith associates prudence with security, foresight, knowledge,
   steady effort, frugality, and circumspection. That supports attention to
   durable safety, not a claim that Smith developed modern risk engineering.
   Source: https://www.adamsmithworks.org/documents/section-i-of-the-character-of-the-individual-so-far-as-it-affects-his-own-happiness-or-of-prudence

2. **Prudence, justice, and another person's standpoint.** Smith distinguishes
   care for one's own welfare from duties toward others and uses the impartial
   spectator as a device for judging beyond immediate self-interest. Round 2
   translates that into ordinary questions about who bears a decision's harm;
   it avoids turning the term into lecture jargon.
   Sources:
   https://www.adamsmithworks.org/documents/conclusion-of-the-sixth-part and
   https://plato.stanford.edu/entries/smith-moral-political/

3. **Institutions and protection from injury.** The University of Glasgow's
   account of Smith's jurisprudence describes civil institutions as protecting
   people and administering justice while varying with social conditions. This
   permits a question about how dissent is heard, but not a claim that Smith
   endorsed a modern veto-and-review design.
   Source: https://www.gla.ac.uk/explore/adamsmith300/explorelearn/ideas/keyworks/lecturesonjurisprudence/

## Book evidence carried forward unchanged

- Both completed sessions treated safety margin as the capacity to survive or
  recover after a forecast fails.
- The first debated Arkhipov, heroic restraint, agreement procedures, veto
  power, and decision paralysis.
- The second distinguished outside shocks from risks whose probability can be
  reduced without erasing responsibility by calling everything luck.
- The returning-aircraft example warned against judging a system only from its
  visible survivors.

These are summaries of the completed table conversations, not quotations from
Housel's book.

## Limits and red-team cautions

- Smith died in 1790. The imagined guest must not imply that he read *Same as
  Ever*, knew Arkhipov, or encountered modern organizations.
- The candidate turns and cue patterns are newly composed. None is presented as
  a historical quotation, translation, or authenticated verbal habit.
- The impartial-spectator framework does not provide an infallible neutral
  answer and may reflect a society's biases. The guest remains open to rebuttal.
- Smith's moral account of prudence is not a theory of tail risk, probability,
  resilient engineering, or safety-margin optimization.
- The jurisprudence sources do not prove that Smith would endorse the concrete
  procedures discussed here.
- A single modern business book cannot establish repeat resistance. Cross-book
  and wrong-genre trials remain required before product use.

## Blind-evaluation handoff

Evaluators should receive the case without `guestCandidate`, `guestSampleId`,
this note, or source URLs. Reveal the identity only after scores and preference
are locked, then red-team the guest for fake quotation, modern-experience claims,
authority effects, costume speech, cue repetition, and unsupported historical
certainty.
