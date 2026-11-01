import { getPanelTexts } from "../texts";

export default function PanelPlans({ projectID: _projectID }: { projectID: string }) {
  const texts = getPanelTexts();
  return <section>
    <h3 className="text-2xl">{texts.plansHeading}</h3>
    <p className="mt-6 text-sm text-neutral-600 dark:text-neutral-400">{texts.plansUnavailable}</p>
  </section>;
}
