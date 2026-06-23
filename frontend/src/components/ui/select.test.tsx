import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

/**
 * Base UI's <Select.Value> shows the raw selected value unless the Root has an
 * `items` map. Our Select wrapper derives that map from <SelectItem> children,
 * so the CLOSED trigger must show the human-readable label — never the raw id /
 * "all" / "12" value the user was seeing.
 */
describe("Select trigger label resolution", () => {
  function triggerText(container: HTMLElement): string | null | undefined {
    return container.querySelector('[data-slot="select-value"]')?.textContent;
  }

  it("shows a selected item's label, not its raw value", () => {
    const { container } = render(
      <Select defaultValue="usr_internal_id_123">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="usr_internal_id_123">Asha Menon</SelectItem>
          <SelectItem value="usr_other">Ravi Kumar</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(triggerText(container)).toBe("Asha Menon");
  });

  it("resolves filter-style 'all' to its label", () => {
    const { container } = render(
      <Select defaultValue="all">
        <SelectTrigger>
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="TODO">To Do</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(triggerText(container)).toBe("All statuses");
  });

  it("resolves a numeric-string value (e.g. months) to its label", () => {
    const { container } = render(
      <Select defaultValue="12">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="6">Last 6 months</SelectItem>
          <SelectItem value="12">Last 12 months</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(triggerText(container)).toBe("Last 12 months");
  });
});
