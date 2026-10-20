export function endWork(task, at) {
  if (task.runningSince) {
    task.workMs = (task.workMs || 0) + Math.max(0, at - task.runningSince);
    (task.workSegments ||= []).push({staff:task.assignee,from:task.runningSince,to:at});
  }
  delete task.runningSince;
}
export function closeArrival(arrival, at) {
  arrival.sessions ||= [{ in: arrival.at }];
  const open = arrival.sessions.findLast(s => !s.out);
  if (open) open.out = at;
  arrival.outAt = at;
}
export function pauseStaffTasks(day, staff, at) {
  for (const task of day.tasks) if (!task.archived && task.assignee === staff && task.status === 'progress') {
    endWork(task, at); task.status = 'pending'; task.updatedAt = at;
    (task.history ||= []).push({ at, by: staff, status: 'pending', event: 'Paused at clock-out' });
  }
}
