# The Director's Cheat Sheet
*The Artificial Advantage Toolkit*

The whole system on a few printable pages: CLEAR, RTC, the Diagnostic Ladder and the Two-Step Verification Method. Print it, pin it near your desk, and use it until you no longer need to look.

## 1. The CLEAR System


CLEAR is the organizing framework for everything in this book. Each letter names a stage of professional AI fluency. Use it to orient yourself when you feel stuck and to identify which skill to develop next.

C: Choose Your Tools (Part 2)

Build your personal AI toolkit. Match the model and tool to the task. Use the Vibe Test to select your starting platform, the Model Types guide to choose between fast and reasoning models, and specialist tools for anything beyond text.

Primary decision: Which tool fits this task?

L: Lead with Clear Direction (The Three Fundamental Rules)

Apply the RTC Framework to every prompt. Clear inputs produce clear outputs. No amount of iteration fully compensates for a vague starting point.

Primary decision: Have I given the model a Role, a Task, and a Constraint?

E: Evolve Your Outputs (Iteration Patterns and The Invisible Skills)

Iterate precisely instead of repeatedly. Use the Iteration Vocabulary to diagnose specific problems. Apply Constraint Architecture and Meta-Prompting to raise your ceiling beyond what standard prompting reaches.

Primary decision: What specifically is wrong, and what instruction would fix it?

A: Audit for Accuracy (Trust, but Verify)

Apply the two-step verification method before using any AI output that carries professional risk. Match your verification effort to the stakes involved.

Primary decision: Is this a factual claim, a subjective judgment, or creative generation?

R: Repeat to Build a Practice (Building Your AI Practice)

Build a prompt library and workflow templates. Consistency converts skill into infrastructure. The three-month plan shows you how to keep developing after the book ends.

Primary decision: Is this prompt worth saving for the next time this task appears?

The Director's Mindset (The Mental Shift That Makes AI Work)

AI is your crew. You set the vision, direct the output, and take responsibility for the result. This never changes, regardless of which stage of CLEAR you're in.

## 2. The RTC Framework


RTC is the structured prompt framework for professional-grade outputs. Apply it to every substantive task.

Role: Who should the AI act as?

Give it an identity and relevant expertise. Be specific about domain, experience level, and perspective.

Example: "Act as a senior HR manager with ten years of experience in remote team onboarding."

Task: What specifically do you need?

One deliverable per message. The more precisely you define the output, the better the result.

Example: "Write a 30-day onboarding checklist for a new remote employee starting in a client-facing role."

Constraint: What guardrails apply?

Include length, tone, audience, format, and any content limits. Constraints are the instructions that make the output usable; they focus the model instead of limiting it.

Example: "Keep each item under 15 words. Use plain language. Avoid corporate jargon. Format as a numbered list."

Full RTC Example:

"Act as a senior HR manager with remote team experience [Role]. Write a 30-day onboarding checklist for a new remote employee in a client-facing role [Task]. Each item under 15 words, plain language, numbered list, no corporate jargon [Constraint]."

Common RTC Mistakes:

Vague Role: "Act as an expert." Expert in what? For whom? For what purpose?

Missing Task scope: "Write something about onboarding." What format? What length? What audience?

No Constraints: Outputs without constraints tend to be generic. Constraints force specificity.

## 3. The Diagnostic Ladder
*From Chapter 11, Iteration Patterns*


Every iteration that doesn't land can be run down the same three rungs.

Rung one, name the symptom. What's actually wrong with the output in front of you? It falls into one of five categories. Name yours and you've narrowed the whole problem to a single word.

Rung two, trace it to the root cause. The symptom you see almost always traces back to one element of your original prompt: Role, Task, or Constraint. This is where you decide whether to iterate or start over.

Rung three, write the corrective prompt. One symptom, one cause, one targeted instruction that leaves everything else alone.

Here's each rung in full.

#### Rung One: The Five-Point Diagnosis

Every off-target output sorts into one of five symptoms. Name yours and you'll know exactly what to say.

Length. The output is too long or too short. Fix it with a measurable instruction: "Cut this by half, keeping the three main points." "Cut by half" tells the model exactly what to do, while "make it shorter" leaves the degree wide open.

Tone. The output sounds wrong for your audience. The strongest corrections use a person rather than an adjective. "Rewrite this the way an executive would respond" beats "make it more formal." "Explain this the way a good friend would, no jargon" lands harder than "make it conversational." Give the model someone to imitate instead of a mood to approximate.

Structure. The organization is wrong, the lead gets buried, or the format doesn't fit. Name the sequence you want: "Reorganize this so the main point comes first, then the supporting detail," or "Break this into three sections with headers: Problem, Solution, Next Step."

Specificity. The output reads like a template anyone could have written. This was Marcus's symptom, and it almost always means you didn't give the model enough to work with. Before asking AI to fix it, audit how much context you actually supplied. A useful follow-up: "How many of the five points I gave you are reflected in this output?" Let the model tell you where it lost your thread.

Accuracy and relevance. The output contains factual errors, invented citations, or content that drifted off-topic. Flag factual errors directly, with the correction and a source. Kill hallucinated citations on sight: "That study doesn't exist. Remove the citation or find a real one." Reanchor topic drift: "This addresses Y, but I asked about Z. Start over on the correct topic." A working method for verifying it yourself: paste the claim or the study title into a search engine, and if you can't find a real source for it in about two minutes, treat it as fabricated and cut it. The model can be confident and wrong in the same breath, so check every fact, statistic, and citation before it leaves your hands.

#### Rung Two: Trace It to Role, Task, or Constraint

The symptom is what you see. The root cause is why it happened, and it traces back to one of three elements from your original prompt.

A Role problem means the model answered from the wrong perspective or expertise. A corporate memo when you needed a peer message is a role problem. Reset the role: "Rewrite this from the perspective of a trusted colleague rather than a corporate communications team."

A Task problem means the model misunderstood what you wanted, or you didn't give it enough to understand. An explanation when you needed step-by-step instructions is a task problem. So is Marcus's generic email: he gave a clear instruction but withheld the context the task actually required. Clarify or supply what was missing: "I need numbered instructions rather than an overview," or, in Marcus's case, the figures that made the situation his.

A Constraint problem means the model got the role and task right but executed them wrong on length, tone, format, or audience. These are the easiest to fix. Reinforce the constraint: "Cut this to 200 words."

The symptom list and the cause list line up more cleanly than they first look. Length, Tone, and Structure are usually Constraint problems: the model understood you and shaped the output wrong. Specificity is usually a Task-or-context problem: you didn't hand over enough, which is exactly where Marcus landed. Accuracy is the odd one out: it is a verification problem, so you check it rather than re-prompt it.

This rung is also where you make the call that matters most: iterate or start over. Iteration refines what already exists. It cannot fix a broken premise. So the test is simple: whether the model did the wrong thing well, or the right thing badly. Constraint problems and missing-context problems mean the foundation is sound, so iterate; a precise follow-up will land. A true Task problem, where the model did the wrong thing well because you asked for the wrong thing, means you should start over with a clearer brief. Refining a misframed prompt only produces incrementally better wrong answers.

The other trigger to start over is volume. If you're heading into a fourth or fifth round and the output still isn't moving the right direction, stop patching. Each fix reasons off the flawed draft underneath it, so the errors compound instead of clearing, and six rounds on a bad start usually run slower than one clean restart with a better brief.

#### Rung Three: Write the Corrective Prompt

Now you spend what you diagnosed. The swaps in this section are the Iteration Vocabulary, the phrasing that turns a complaint into a direction, and Appendix C collects the full set on one page. A strong corrective prompt has four traits:

Reference what exists. "In the second paragraph, the explanation is too abstract." This tells the model what to preserve everywhere else.

Use directive verbs. "Rewrite," "cut," "expand," "remove," "consolidate" name the exact action. "Make better," "enhance," "improve" leave the model guessing.

Specify what "better" means. "Make this more persuasive by adding a customer testimonial and a specific ROI figure" beats "make it more persuasive" every time.

Address one thing at a time. "Make it shorter, more casual, add examples, and reorganize it" forces the model to rank four changes at once. Sequence your fixes and confirm each one landed before stacking the next.

That's the ladder. Symptom, cause, correction: the same three rungs Marcus climbed in one pass, now slow enough to run yourself. Saint-Exupéry could have been describing this. A finished draft arrives when you've taken the wrong things out one at a time, until nothing is left to fix.

## 4. The Two-Step Verification Method


Before using any AI output professionally, sort the claim with these three questions. That's step one. Step two is matching your verification effort to the stakes.

Question 1: Is this a factual claim?

Specific dates, statistics, citations, quotes, named sources, research findings.

Action: Verify when it matters. A single independent source is sufficient. The presence of a citation format does not guarantee the source exists. AI can and does hallucinate plausible-sounding references.

Question 2: Is this subjective or opinion-based?

Recommendations, creative suggestions, stylistic choices, interpretations.

Action: Use your judgment. Treat as a starting point. You are the expert on your situation. The AI is not.

Question 3: Is this creative generation?

Draft emails, outlines, plans, stories, code, frameworks.

Action: Judge by usefulness and fit. What matters is whether it serves your purpose, more than whether it's accurate.

Verification effort by stakes:

Low stakes (internal notes, personal use): 30 seconds, gut check for obvious errors.

Medium stakes (client-facing, published content): 2–3 minutes targeted fact-checking on specific claims.

High stakes (legal, medical, financial, public record): Expert consultation. AI output is input rather than conclusion.

Hallucination warning signs:

Specific statistics with no source, Very specific dates on obscure events, Named quotes from living people, Academic citations that sound plausible, Legal precedents or case names.
