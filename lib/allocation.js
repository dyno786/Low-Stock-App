import { londonDay } from './team-store.js';
export const SKILLS = [
  { id: 'till', name: 'Till & customer service', minutes: 0 },
  { id: 'pick', name: 'Picking orders', minutes: 60 },
  { id: 'neg', name: 'Correcting negative stock', minutes: 40 },
  { id: 'over', name: 'Moving overstock', minutes: 45 },
  { id: 'low', name: 'Replenishing low stock', minutes: 60 },
  { id: 'shop', name: 'Adding products to Shopify', minutes: 60 },
  { id: 'img', name: 'Product photos & images', minutes: 45 },
];
export const LEVELS = ['untrained', 'learning', 'trained'];
export function branchConfig(state, branch) {
  return { enabled: branch === 3 ? ['pick', 'over', 'low'] : ['pick', 'neg', 'over', 'low', 'shop', 'img'], tillDuties: branch === 3 ? [] : ['shop'], tillRequired: branch !== 3, ...(state.config || {}) };
}
export function training(person, id) { return person.confirmedSkills?.[id] || person.skills?.[id] || 'untrained'; }
export function allocate(state, branch, now = Date.now()) {
  const date = londonDay(now); const day = state.days[date] ||= { arrivals: {}, tasks: [] };
  const config = branchConfig(state, branch);
  const people = Object.keys(day.arrivals).filter(id => state.staff[id]?.active && !day.arrivals[id].outAt && day.arrivals[id].trainingDate === date);
  const tasks = day.tasks;
  const seniority = id => ({ new: 0, experienced: 1, senior: 2 }[state.staff[id].seniority] || 0);
  const trained = (id, job) => training(state.staff[id], job) === 'trained';
  const gaps = [];
  let till = day.till && people.includes(day.till) && trained(day.till, 'till') ? day.till : '';
  if (config.tillRequired && !till) till = people.filter(id => trained(id, 'till')).sort((a, b) => seniority(b) - seniority(a) || day.arrivals[a].at - day.arrivals[b].at)[0] || '';
  day.till = config.tillRequired ? till : '';
  if (config.tillRequired && !till) gaps.push({ job: 'till', reason: 'No signed-in staff member has reported or confirmed till training.' });
  const wanted = new Set(config.enabled.map(job => 'auto-' + job));
  if (config.tillRequired) wanted.add('auto-till');
  // Automatic tasks are stable daily records. Completed and started work is never discarded.
  for (const t of tasks) if (t.auto && !wanted.has(t.id) && t.status === 'pending') t.archived = true;
  const load = Object.fromEntries(people.map(id => [id, tasks.filter(t => !t.auto && !t.archived && t.status !== 'done' && t.assignee === id).reduce((s, t) => s + (t.minutes || 45), 0)]));
  if (till) load[till] = (load[till] || 0) + 240;
  const jobs = config.tillRequired ? ['till', ...config.enabled] : config.enabled;
  for (const job of jobs) {
    const skill = SKILLS.find(s => s.id === job); if (!skill) continue;
    let task = tasks.find(t => t.id === 'auto-' + job);
    if (!task) { task = { id: 'auto-' + job, category: job, title: skill.name, priority: job === 'till' ? 'urgent' : 'normal', notes: '', due: '', status: 'pending', createdAt: now, auto: true, minutes: skill.minutes, history: [] }; tasks.push(task); }
    if (task.archived) continue;
    if (task.status !== 'pending' && job !== 'till') { if (task.assignee && Object.hasOwn(load, task.assignee) && task.status !== 'done') load[task.assignee] += skill.minutes; continue; }
    const buddyValid = task.trainingBuddy && people.includes(task.trainingBuddy) && trained(task.trainingBuddy, job);
    if (task.manualAssignment && task.assignee && people.includes(task.assignee) && (trained(task.assignee, job) || buddyValid) && (task.assignee !== till || job === 'till' || config.tillDuties.includes(job)) && (job !== 'till' || task.assignee === till)) { load[task.assignee] += skill.minutes; continue; }
    let candidates = job === 'till' ? (till ? [till] : []) : people.filter(id => trained(id, job) && (id !== till || config.tillDuties.includes(job)));
    if (job !== 'till' && till && config.tillDuties.includes(job) && trained(till, job)) candidates = [till];
    candidates.sort((a, b) => load[a] - load[b] || seniority(b) - seniority(a) || a.localeCompare(b));
    const assignee = candidates[0] || '';
    if (task.assignee !== assignee) { task.history.push({ at: now, by: 'automatic', assignee }); task.assignedAt=now; }
    task.assignee = assignee; task.updatedAt = now;
    task.notes = assignee === till && job !== 'till' ? 'Till cover comes first. Work on this only when customers do not need you.' : task.notes;
    if (assignee) load[assignee] += skill.minutes;
    else if (job !== 'till') gaps.push({ job, reason: 'No available trained staff member. Allocate training with a trained colleague, or assign manually.' });
  }
  for (const task of tasks) {
    if (task.archived || task.status === 'done' || !task.assignee || (task.auto && task.status === 'pending')) continue;
    if (!people.includes(task.assignee)) gaps.push({ job: task.category, reason: `${task.title}: the assigned person is off shift or has not reviewed training today. Please review this assignment.` });
    else if (task.trainingBuddy && !people.includes(task.trainingBuddy)) gaps.push({ job: task.category, reason: `${task.title}: the training buddy is no longer available. Arrange supervision before continuing.` });
  }
  day.gaps = gaps; day.allocatedAt = now;
  return day;
}
