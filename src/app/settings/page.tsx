import { Suspense } from "react";
import SettingsView from "@/components/SettingsView";

export default function Page() {
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
