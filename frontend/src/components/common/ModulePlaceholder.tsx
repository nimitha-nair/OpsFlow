import { Construction } from "lucide-react";

import { useAuth } from "../../context/auth-context";
import { roleBasePath } from "../../lib/navigation";
import { PageHeader } from "../layout/PageHeader";
import { EmptyState } from "./EmptyState";

interface ModulePlaceholderProps {
  title: string;
  description?: string;
}

/**
 * Structural placeholder for modules that are part of the OpsFlow roadmap but
 * not yet implemented. Renders the standard page header + an empty state.
 */
export function ModulePlaceholder({
  title,
  description,
}: ModulePlaceholderProps) {
  const { user } = useAuth();
  const home = user ? roleBasePath[user.role] : "/";

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: "Dashboard", to: home }, { label: title }]}
      />
      <EmptyState
        icon={Construction}
        title={`${title} module`}
        description="This module is part of the OpsFlow HR system and will be built in an upcoming iteration."
      />
    </>
  );
}
