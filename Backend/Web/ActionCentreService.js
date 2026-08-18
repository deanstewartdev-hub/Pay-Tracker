/*******************************************************
 * PAY TRACKER V3.0 - Action Centre browser API.
 *******************************************************/

function getPayTrackerActionCentre(options) {
  const items = PayTrackerActionCentreRepository.getAll(options || {});
  const allItems = PayTrackerActionCentreRepository.getAll({});
  const jobs = PayTrackerJobRegistryRepository.getAll(false);
  const counts = { open: 0, inReview: 0, resolved: 0, urgent: 0 };
  allItems.forEach(function(item) {
    if (item.status === 'Open') counts.open += 1;
    if (item.status === 'In Review') counts.inReview += 1;
    if (item.status === 'Resolved') counts.resolved += 1;
    if (item.priority === 'Urgent' && item.status !== 'Resolved') counts.urgent += 1;
  });
  return {
    success: true, generatedAt: new Date().toISOString(), counts: counts,
    jobs: jobs.map(serializePayTrackerReconciliationRecord_),
    items: items.map(serializePayTrackerReconciliationRecord_)
  };
}

function decidePayTrackerAction(actionId, decision) {
  return {
    success: true,
    item: serializePayTrackerReconciliationRecord_(
      PayTrackerActionCentreRepository.decide(actionId, decision)
    )
  };
}

/**
 * Adds a source-linked item from another backend service.
 * Duplicate open items for the same source/action type are suppressed.
 */
function createPayTrackerAction(input) {
  return {
    success: true,
    item: serializePayTrackerReconciliationRecord_(
      PayTrackerActionCentreRepository.create(input)
    )
  };
}

function serializePayTrackerReconciliationRecord_(record) {
  const output = {};
  Object.keys(record || {}).forEach(function(key) {
    const value = record[key];
    output[key] = value instanceof Date ? value.toISOString() : value;
  });
  return output;
}
