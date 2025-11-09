async function pushLeadToDealerSocket(lead) {
  console.warn(
    "⚠️ DealerSocket integration not yet implemented. Lead payload:",
    lead?.id
  );
  return { id: "placeholder-crm-id" };
}

module.exports = {
  pushLeadToDealerSocket
};

