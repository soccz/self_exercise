import { Header } from "@/components/layout/Header";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen bg-toss-grey-50 dark:bg-black">
      <Header title="분석" />
      <AnalyticsView />
    </div>
  );
}
