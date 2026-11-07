import test from "node:test";
import assert from "node:assert/strict";
import { evaluateIncidentCorpus } from "../evaluation/evaluate-incidents.mjs";

const incidents = [
 {caseId:"stock",trajectoryId:"purchase_product",runId:"run-stock",outcome:"diverged",rankedHypothesisIds:["wrong","stock-root"],confirmedRootCause:{hypothesisId:"stock-root",eventId:"e1",verification:"confirmed",evidenceIds:["ev1"]}},
 {caseId:"payment",trajectoryId:"purchase_product",runId:"run-payment",outcome:"failed",rankedHypothesisIds:["payment-root","noise"],confirmedRootCause:{hypothesisId:"payment-root",eventId:"e2",verification:"confirmed",evidenceIds:["ev2"]}},
];

test("maps confirmed incident root causes to existing ranking metrics",()=>{
 const result=evaluateIncidentCorpus(incidents,1);
 assert.equal(result.caseCount,2);
 assert.equal(result.mrr,0.75);
 assert.equal(result.recallAtK,0.5);
 assert.equal(result.precisionAtK,0.5);
 assert.deepEqual(result.caseResults.map(x=>x.caseId),["stock","payment"]);
});

test("does not treat unconfirmed cause or missing evidence as ground truth",()=>{
 assert.throws(()=>evaluateIncidentCorpus([{...incidents[0],confirmedRootCause:{...incidents[0].confirmedRootCause,verification:"candidate"}}]),/must contain a confirmed hypothesisId/);
 assert.throws(()=>evaluateIncidentCorpus([{...incidents[0],confirmedRootCause:{...incidents[0].confirmedRootCause,evidenceIds:[]}}]),/evidenceIds must contain evidence references/);
});

test("rejects empty corpus and duplicate case ids",()=>{
 assert.throws(()=>evaluateIncidentCorpus([]),/at least one incident/);
 assert.throws(()=>evaluateIncidentCorpus([incidents[0],incidents[0]]),/Duplicate caseId/);
});

test("enforces incident identity, outcome and event evidence contract",()=>{
 assert.throws(()=>evaluateIncidentCorpus([{...incidents[0],trajectoryId:" "}]),/trajectoryId is required/);
 assert.throws(()=>evaluateIncidentCorpus([{...incidents[0],outcome:"unknown"}]),/outcome must be/);
 assert.throws(()=>evaluateIncidentCorpus([{...incidents[0],confirmedRootCause:{...incidents[0].confirmedRootCause,eventId:" "}}]),/eventId is required/);
 assert.throws(()=>evaluateIncidentCorpus([{...incidents[0],rankedHypothesisIds:["same","same"]}]),/rankedHypothesisIds must be unique/);
 assert.throws(()=>evaluateIncidentCorpus([{...incidents[0],confirmedRootCause:{...incidents[0].confirmedRootCause,evidenceIds:["ev1","ev1"]}}]),/evidenceIds must be unique/);
});
