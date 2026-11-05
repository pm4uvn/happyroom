import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./button";
import { Segmented } from "./primitives";

describe("Button", () => {
  it("defaults to type=button so it never submits forms accidentally", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" }).getAttribute("type")).toBe("button");
  });

  it("renders its child when asChild is set", () => {
    render(
      <Button asChild>
        <a href="/create">Create</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Create" });
    expect(link.getAttribute("href")).toBe("/create");
    expect(link.className).toContain("rounded-full");
  });
});

describe("Segmented", () => {
  it("exposes radio semantics and supports arrow-key selection", () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Theme"
        value="a"
        onChange={onChange}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ]}
      />,
    );
    const a = screen.getByRole("radio", { name: "A" });
    expect(a.getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
