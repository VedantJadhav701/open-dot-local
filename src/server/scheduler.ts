import "server-only";
import { Cron } from "croner";
import * as repo from "./repo";
import { onEvent } from "./bus";
import { runRoutine } from "./agent/runtime";

// Routines are cron jobs that wake a dot with an instruction.

const g = globalThis as unknown as { __dotsJobs?: Map<string, Cron>; __dotsSchedulerStarted?: boolean };
const jobs = (g.__dotsJobs ??= new Map());

function schedule(routineId: string) {
  jobs.get(routineId)?.stop();
  jobs.delete(routineId);
  const routine = repo.getRoutine(routineId);
  if (!routine?.enabled) return;
  jobs.set(
    routineId,
    new Cron(routine.schedule, { protect: true }, () => {
      const fresh = repo.getRoutine(routineId);
      if (fresh) runRoutine(fresh);
    }),
  );
}

export function startScheduler() {
  if (g.__dotsSchedulerStarted) return;
  g.__dotsSchedulerStarted = true;
  for (const r of repo.listRoutines()) schedule(r.id);
  onEvent((ev) => {
    if (ev.type === "routine") schedule(ev.data.id);
    if (ev.type === "routine_deleted") {
      jobs.get(ev.id)?.stop();
      jobs.delete(ev.id);
    }
  });
}
