# Razorpay AI Buildathon 2026 — Complete Brief

## 1. What is the Razorpay AI Buildathon?

The Razorpay AI Buildathon is a **student-only AI building program** run by Razorpay.

The goal is not primarily a conventional hackathon. Razorpay describes it as a way to **discover and hire its next generation of AI Builder Interns**.

The core philosophy is:

> Build something real → demonstrate that it works → show the architecture and evidence → potentially get hired.

Razorpay explicitly says:

* Students only
* No resume screening
* No long application
* No aptitude test
* No group discussion
* Shortlisted builders go directly to a panel
* The candidate's code and working product matter more than their resume

Official page:
https://razorpay.com/buildathon/

---

# 2. Internship Offer

Successful/shortlisted candidates can potentially receive:

* **₹75,000 monthly stipend**
* **6-month or 12-month AI Builder Internship**
* **In-person**
* **Bangalore**
* Starting from **September**

The candidate chooses between a 6-month or 12-month internship.

Razorpay's positioning is essentially:

**"Your code speaks louder than your resume."**

---

# 3. Application / Selection Process

Razorpay describes the process in four broad steps:

### Step 1 — Pick a track

Choose one of the five available tracks.

### Step 2 — Build something real

Build an actual working AI system/product around the selected problem area.

### Step 3 — Show your work

The submission needs to demonstrate the work through:

* A **public GitHub repository**
* A **5-minute pitch video**
* The **architecture**

### Step 4 — Razorpay evaluates the signal

If the project provides enough signal, Razorpay calls the candidate in for the next stage/panel.

Important:

This means the submission should NOT be treated as merely an idea pitch.

The project needs to demonstrate:

* Working implementation
* Technical depth
* AI usage
* Architecture
* Measurable results
* Reliability
* Real-world usefulness
* Handling of failure/edge cases where relevant

---

# 4. The Five Buildathon Tracks

There are five tracks:

1. AI Growth & Agentic Commerce
2. AI Risk Manager
3. AI Revenue Recovery
4. AI Finance Controller
5. Open Track

---

# TRACK 01 — AI Growth & Agentic Commerce

## Goal

**Grow the merchant's revenue and make the merchant sellable/transactable by AI buyers.**

The project should either:

1. Build an AI agent that grows revenue for a merchant using Razorpay test-mode APIs

OR

2. Make a merchant transactable by an AI buyer end-to-end.

---

## Why Razorpay considers this important

Razorpay identifies agent-to-agent commerce as a major emerging problem.

The page specifically references:

* NPCI's UAP
* ACP
* AP2
* x402

Razorpay believes the way people buy things is moving toward AI agents that can:

1. Understand what the user wants
2. Discover products/services
3. Make decisions
4. Interact with merchants
5. Complete transactions

Therefore, merchants increasingly need infrastructure that allows them to become **AI-readable and AI-transactable**.

---

## Example project directions

Razorpay explicitly gives these examples:

### Conversational in-app checkout

An AI conversation where the customer can discover something and complete checkout without leaving the conversational interface.

### Agent-readable catalog

Make a merchant's product catalog understandable and usable by AI agents.

The AI should be able to understand:

* Products
* Prices
* Availability
* Attributes
* Variants
* Other relevant purchasing information

### Upsell & cross-sell agent

An agent that identifies opportunities to increase order value.

For example:

Customer purchases a laptop →

AI recognizes an opportunity →

Suggests compatible accessories →

Customer accepts →

Purchase proceeds.

### Campaign orchestrator

An AI system that can determine and execute appropriate merchant growth campaigns.

---

## Evaluation bar for this track

This is extremely important.

Razorpay says:

**Every money action must be explainable, bounded and gated.**

The project should therefore demonstrate:

### Explainability

The system should be able to explain why it performed a particular financial action.

### Bounded actions

The AI should NOT have unrestricted authority.

Actions should have defined limits.

### Gated actions

Important money-related operations should require appropriate authorization/approval.

### Audit trail

The system must record what happened.

For example:

```text
User request
↓
Agent reasoning/decision
↓
Recommended action
↓
Authorization/check
↓
Razorpay API action
↓
Result
↓
Audit log
```

### Failure handling

The demo must show at least **one failure being handled gracefully**.

The system should not simply assume that every API call or AI decision succeeds.

---

# TRACK 02 — AI Risk Manager

## Goal

Prevent merchants from losing money through:

* Fraud
* Returns
* Chargebacks

The project should build a working:

* Detector
* Verifier
* OR
* Auto-responder

for **one specific class of financial loss**.

---

## Required ML evaluation

This track explicitly requires:

### Precision

How many of the things predicted as risky were actually risky?

### Recall

How many of the truly risky cases did the system successfully identify?

The metrics must be measured on a:

**held-out test set**

This is important because Razorpay does not want a model that only works on the examples it was trained/tested on.

---

## Example directions

Razorpay suggests:

### Chargeback evidence responder

An AI system that helps automatically prepare responses/evidence for chargeback disputes.

### Return-risk scorer

Predict whether a transaction/order/customer is likely to result in a return.

### Fraud-spike detector

Detect unusual increases in fraudulent activity.

### Abuse-ring sentinel

Identify potentially coordinated abusive behavior.

---

## Evaluation bar

Razorpay specifically asks for:

### Honest metrics

Do not cherry-pick impressive numbers.

Report actual performance.

### False-positive cost

This is especially important.

A fraud system can make two types of mistakes:

```text
Actual fraud → predicted legitimate
= False Negative

Actual legitimate → predicted fraud
= False Positive
```

False positives have a business cost.

For example:

A legitimate customer gets blocked because the model incorrectly thinks they are fraudulent.

Therefore, the project should quantify or at least discuss the cost of false positives.

---

## Critical restriction

This track is:

**STRICTLY DEFENSE-ONLY.**

Anything that is capable of facilitating offensive abuse/fraud is disqualified.

The project should only detect, prevent, verify, or respond to risk.

---

# TRACK 03 — AI Revenue Recovery

## Goal

Find revenue that is being lost and recover it.

This track is about closing the entire loop:

```text
Detect revenue risk
        ↓
Understand why it happened
        ↓
Choose intervention
        ↓
Execute recovery action
        ↓
Measure recovered revenue
```

The key distinction is:

**Do not merely identify lost revenue. Actually demonstrate recovery.**

---

## Problems Razorpay identifies

Revenue can disappear through:

* Payment failures
* Checkout abandonment
* Subscription failures
* Overdue invoices
* Payment degradation
* Other revenue leakage

---

## Example directions

Razorpay explicitly suggests:

### Payment degradation → root cause → recovery action

Detect deterioration in payment performance, identify the likely cause, then perform an appropriate recovery action.

### Checkout drop-off recovery

Identify users who abandoned checkout and attempt to recover those purchases.

### Failed-subscription recovery

Detect failed recurring payments and attempt to recover the subscription.

### B2B receivables chaser

Help businesses collect overdue B2B payments.

### Mandate retry sequencer

Determine when/how to retry failed mandates.

### Hinglish voice recovery

Use voice interactions in Hinglish to help recover failed payments.

### Promise-to-pay tracker

Track commitments from customers who promise to make payment later.

---

## Evaluation bar

This track has a very specific requirement:

**Show measured money recovered across a batch.**

Not:

> "Our AI can identify customers who might pay."

Instead:

```text
100 failed payments
        ↓
AI identifies recovery candidates
        ↓
Interventions executed
        ↓
X payments recovered
        ↓
₹Y recovered
```

The project should also demonstrate:

### Compliant escalation

Escalate appropriately instead of endlessly contacting customers.

### Stopping rules

The agent must know when to stop.

For example:

```text
Retry 1
↓
Retry 2
↓
Customer contacted
↓
No response
↓
STOP
```

### Audit trail

Every important decision/action should be recorded.

---

# TRACK 04 — AI Finance Controller

## Goal

Use AI to automate finance operations around:

* Books
* Cash position
* Reconciliation
* Settlement
* Forecasting

The core idea is to automate a finance-operations loop that normally requires manual work.

---

## Required dataset scale

The system must work across:

**50+ records of synthetic data**

This is important.

A single manually selected example is insufficient.

The project needs to demonstrate that the system works across a meaningful batch.

---

## Required reporting

The system should report:

### Match rate

How many records were successfully matched/resolved?

### Exceptions

Which records could not be confidently resolved?

The project should NOT hide difficult cases.

---

## Why Razorpay considers this important

Razorpay argues that in 2026 the bottleneck is increasingly:

**verification capacity rather than generation speed.**

Finance teams still perform significant manual work around:

* Reconciliation
* Settlement
* Forecasting

AI can potentially automate parts of these workflows while maintaining verification and control.

---

## Example directions

### Multi-source reconciliation

Match records across multiple financial data sources.

For example:

```text
Payment system
      +
Bank statement
      +
Order database
      ↓
AI reconciliation
      ↓
Matched records
+
Exceptions
```

### Settlement Q&A agent

Ask questions about settlement data using natural language.

### Forward cash forecaster

Predict future cash position.

### Tax-line matcher

Match financial records against appropriate tax lines.

---

## Evaluation bar

Razorpay explicitly wants:

### Throughput

How many records can the system process?

### Measured accuracy

How accurately does it resolve them?

### Honest exception list

Which cases did it fail to resolve?

The key principle is:

**One cherry-picked successful match proves nothing.**

The system needs batch-level evidence.

---

# TRACK 05 — Open Track

## Goal

Build whatever you believe should exist.

The idea does NOT have to fit the four predefined tracks.

You can select:

* Any domain
* Any workflow
* Any user/problem

provided the project is genuinely valuable and meaningfully uses AI.

---

## What Razorpay wants

Find:

**A real problem → build a real solution → demonstrate that it works.**

---

## Example directions

Razorpay deliberately leaves this open:

* Surprise us
* Solve a problem you deeply understand
* Build something we haven't thought of

---

## Evaluation bar

Open Track is NOT an easier track.

The project still needs to demonstrate:

1. A real problem
2. A working product
3. Meaningful use of AI
4. Evidence of value
5. Strong execution
6. Reliability
7. Technical depth

---

# 5. What Razorpay Seems to Value Across ALL Tracks

Across the five tracks, there are several recurring principles.

## A. Build a real working system

A conceptual architecture alone is not enough.

The evaluator should be able to see something actually functioning.

---

## B. AI must be meaningful

Do not simply add an LLM chatbot to an existing application.

The AI should perform meaningful work such as:

* Decision-making
* Prediction
* Classification
* Reasoning
* Automation
* Natural-language interaction
* Planning
* Agentic execution
* Anomaly detection
* Financial analysis

depending on the track.

---

## C. Measure results

Razorpay repeatedly emphasizes measurement.

Examples:

### Risk

Precision + recall + false-positive cost

### Finance

Match rate + throughput + exceptions

### Revenue recovery

Actual money recovered across a batch

### Growth

Demonstrable revenue/growth impact

---

## D. Handle failure

A serious AI system cannot assume:

```text
AI decision = always correct
API = always succeeds
data = always clean
```

The project should demonstrate what happens when things go wrong.

---

## E. Financial actions need guardrails

Especially in payment/finance projects:

```text
AI
 ↓
Decision
 ↓
Validation
 ↓
Authorization / gate
 ↓
Action
 ↓
Audit
```

Do not build an autonomous financial agent with unlimited authority.

---

## F. Auditability matters

The system should be able to answer:

* What happened?
* Why did it happen?
* What did the AI decide?
* What action was taken?
* What data influenced the decision?
* Was the action authorized?
* What was the result?

---

# 6. What the Submission Needs to Demonstrate

The Buildathon page specifically calls out:

### 1. Public repository

The code should be available publicly.

The repository should ideally contain:

* Clear README
* Setup instructions
* Architecture
* Dataset information
* Model information
* Evaluation methodology
* Results
* Demo instructions
* API documentation where relevant
* Limitations

---

### 2. 5-minute pitch video

The video needs to communicate the project quickly.

A strong structure would be:

```text
0:00–0:30
Problem

0:30–1:00
Why existing solutions are insufficient

1:00–2:00
Product/demo

2:00–3:00
AI/agent architecture

3:00–4:00
Evaluation + metrics

4:00–4:40
Failure handling + guardrails

4:40–5:00
Impact + why this matters to Razorpay
```

---

### 3. Architecture

The architecture should make it clear:

* User/input
* AI/model
* Agents
* Tools
* APIs
* Database
* Decision layer
* Guardrails
* External systems
* Audit logging
* Output

---

# 7. Razorpay's Broader AI Direction

The Buildathon should be understood in the context of Razorpay's broader 2026 strategy.

Razorpay is heavily investing in **AI-native payments and agentic commerce**.

Their 2026 materials describe an "Agentic Era" involving:

* Agentic payments
* AI-led shopping
* Conversational checkout
* Payments inside LLMs
* Voice payments
* Agentic onboarding
* AI developer tooling
* AI customer support
* Agentic dashboards
* Dispute automation
* Cashflow insights
* RTO/risk management
* Subscription recovery
* Receivables automation
* AI-powered business banking

Razorpay has also launched/announced infrastructure around AI agents, including its MCP capabilities and payment tooling.

Therefore, projects that demonstrate **AI + financial infrastructure + reliable autonomous workflows** are particularly aligned with Razorpay's current direction.

---

# 8. Important Razorpay AI Context

Razorpay's broader direction is moving beyond:

```text
Human
 ↓
Dashboard
 ↓
Payment
```

toward:

```text
Human
 ↓
AI Agent
 ↓
Decision / Intent
 ↓
Razorpay infrastructure
 ↓
Payment / Financial action
 ↓
Verification / authorization
 ↓
Audit
```

The company is also working toward making its capabilities available through:

* APIs
* AI agents
* Developer environments
* Automation systems
* MCP
* CLI
* Conversational interfaces

Razorpay announced its payment CLI in May 2026, explicitly positioning it as infrastructure for developers and the AI-agent era.

Razorpay has also announced integrations around AI-assisted payment management and monetization.

---

# 9. What NOT to Build

Based on the Buildathon's stated requirements, avoid projects that are essentially:

### ❌ A generic chatbot

Example:

> "Chat with your Razorpay data."

Unless the chatbot actually performs a meaningful workflow and creates measurable value.

### ❌ AI wrapper

Simply sending prompts to an LLM without meaningful AI/system architecture is weak.

### ❌ Static dashboard

A dashboard showing analytics is not enough if there is no meaningful AI-driven action.

### ❌ Unmeasured demo

Do not say:

> "Our model works very well."

Show actual numbers.

### ❌ Cherry-picked examples

Especially for Finance/Risk.

Use batches and held-out data.

### ❌ Autonomous unrestricted money movement

Financial actions need:

* Bounds
* Authorization
* Guardrails
* Audit trail

### ❌ Offensive fraud capabilities

The Risk Manager track explicitly disqualifies offense-capable systems.

---

# 10. What an Extremely Strong Project Would Look Like

A strong Buildathon project would ideally have this structure:

```text
                    USER / MERCHANT
                          │
                          ▼
                  ┌───────────────┐
                  │   AI AGENT    │
                  └───────┬───────┘
                          │
                 Understand / Reason
                          │
                          ▼
                  ┌───────────────┐
                  │ Decision Layer│
                  └───────┬───────┘
                          │
                    Guardrails
                          │
                 ┌────────┴────────┐
                 │                 │
             Allowed           Blocked
                 │                 │
                 ▼                 ▼
          Razorpay APIs       Explanation
                 │
                 ▼
             Financial
              Action
                 │
                 ▼
             Verification
                 │
                 ▼
             Audit Trail
                 │
                 ▼
          Outcome / Metrics
```

The important thing is that the AI is not just generating text.

It is **doing useful work**.

---

# 11. The Core Question the Project Should Answer

A strong submission should be able to answer:

> "Why does this need AI?"

Then:

> "What does the AI actually do?"

Then:

> "How do you know it works?"

Then:

> "What happens when it is wrong?"

Then:

> "How do you prevent it from causing financial harm?"

Then:

> "How much business value does it create?"

If the project cannot answer these questions clearly, it is probably not strong enough.

---

# 12. Official Razorpay Sources

Buildathon:
https://razorpay.com/buildathon/

Razorpay AI / Agentic direction:
https://razorpay.com/sprint/26

Razorpay AI/payment CLI announcement:
https://razorpay.com/newsroom/razorpay-brings-payment-command-line-interface-to-india-built-for-developers-and-the-ai-agent-era/

Razorpay/OpenAI Codex payment integration:
https://razorpay.com/newsroom/?p=4713

Razorpay newsroom:
https://razorpay.com/newsroom/

---

# 13. Most Important Takeaway

This should NOT be approached as:

> "What cool AI project can we build?"

It should be approached as:

> "What financially meaningful problem can we solve with AI, demonstrate quantitatively, execute safely, and prove through a real working system?"

The strongest submissions will likely combine:

**AI + real financial workflow + agentic execution + measurable business outcome + guardrails + auditability + strong engineering.**

The Buildathon is ultimately an **AI Builder hiring funnel**, so the project should demonstrate that the builder can actually engineer production-minded AI systems rather than merely create an impressive demo.
