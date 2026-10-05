const STAGE_DEFINITIONS = {
  application_received: {
    progressPercent: 5,
    nextExpectedAction: 'Tele-verification pending',
  },
  telecaller_contacted: {
    progressPercent: 15,
    nextExpectedAction: 'Document collection pending',
  },
  documents_requested: {
    progressPercent: 25,
    nextExpectedAction: 'Customer document upload pending',
  },
  documents_uploaded: {
    progressPercent: 35,
    nextExpectedAction: 'Document verification pending',
  },
  documents_review: {
    progressPercent: 45,
    nextExpectedAction: 'Credit review pending',
  },
  documents_verified: {
    progressPercent: 50,
    nextExpectedAction: 'Credit decision pending',
  },
  approved: {
    progressPercent: 60,
    nextExpectedAction: 'Agreement eSign pending',
  },
  agreement_sent_for_esign: {
    progressPercent: 70,
    nextExpectedAction: 'Customer eSign pending',
  },
  agreement_signed: {
    progressPercent: 80,
    nextExpectedAction: 'Disbursement pending',
  },
  accounting_handoff: {
    progressPercent: 85,
    nextExpectedAction: 'Account transfer pending',
  },
  disbursed: {
    progressPercent: 100,
    nextExpectedAction: 'Repayment active',
    terminal: false,
  },
  repayment_active: {
    progressPercent: 100,
    nextExpectedAction: 'Repayment monitoring active',
  },
  closed: {
    progressPercent: 100,
    nextExpectedAction: 'Loan closed',
    terminal: true,
  },
  rejected: {
    progressPercent: 100,
    nextExpectedAction: 'Application closed',
    terminal: true,
  },
};

const STATUS_STAGE_FALLBACK = {
  Closed: 'closed',
  Contacted: 'telecaller_contacted',
  Converted: 'disbursed',
  'Document Collection': 'documents_review',
  Lost: 'rejected',
  New: 'application_received',
  Qualified: 'approved',
};

function normalizeStageKey(stageKey, status) {
  const candidate = String(stageKey || '').trim();
  if (candidate && STAGE_DEFINITIONS[candidate]) return candidate;

  return STATUS_STAGE_FALLBACK[String(status || '').trim()] || 'application_received';
}

function definitionForStage(stageKey, status) {
  const normalizedStageKey = normalizeStageKey(stageKey, status);
  return {
    statusCode: normalizedStageKey,
    ...STAGE_DEFINITIONS[normalizedStageKey],
  };
}

function enrichPublicEvent(event = {}) {
  const stage = definitionForStage(event.stageKey, event.status);
  return {
    ...event,
    statusCode: stage.statusCode,
    progressPercent: stage.progressPercent,
    nextExpectedAction: stage.nextExpectedAction,
    isTerminalStatus: Boolean(stage.terminal),
  };
}

function summarizeTimeline(timeline = [], fallbackStage = {}) {
  const latest = timeline[timeline.length - 1] || {};
  const stage = definitionForStage(
    latest.stageKey || fallbackStage.stageKey,
    latest.status || fallbackStage.status,
  );

  return {
    statusCode: stage.statusCode,
    progressPercent: stage.progressPercent,
    nextExpectedAction: stage.nextExpectedAction,
    isTerminalStatus: Boolean(stage.terminal),
  };
}

module.exports = {
  definitionForStage,
  enrichPublicEvent,
  summarizeTimeline,
};
