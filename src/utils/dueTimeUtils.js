export const getDueDateTimeAtFivePm = (dateToReturn) => {
  if (!dateToReturn) return null;

  const dueDate = new Date(dateToReturn);
  if (Number.isNaN(dueDate.getTime())) return null;

  const dueAtFivePm = new Date(dueDate);
  dueAtFivePm.setHours(17, 0, 0, 0);

  return dueAtFivePm;
};

export const isReturnedLate = ({
  dateToReturn,
  returnedAt
}) => {
  const dueAtFivePm = getDueDateTimeAtFivePm(dateToReturn);
  if (!dueAtFivePm) return false;

  const actualReturn = returnedAt ? new Date(returnedAt) : null;
  if (!actualReturn || Number.isNaN(actualReturn.getTime())) return false;

  return actualReturn.getTime() > dueAtFivePm.getTime();
};
