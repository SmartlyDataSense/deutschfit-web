import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge, Box, Button, Card, Input, Text } from "@/components/primitives";

describe("Button", () => {
  it("renders primary variant with CTA color class", () => {
    render(<Button variant="primary">Subscribe</Button>);
    const btn = screen.getByRole("button", { name: "Subscribe" });
    expect(btn.className).toMatch(/bg-cta/);
  });

  it("renders ghost variant without bg-cta", () => {
    render(<Button variant="ghost">Cancel</Button>);
    expect(screen.getByRole("button", { name: "Cancel" }).className).not.toMatch(/bg-cta/);
  });

  it("forwards arbitrary props (e.g. type, disabled)", () => {
    render(
      <Button variant="primary" type="submit" disabled>
        Send
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Send" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("type", "submit");
  });
});

describe("Box / Text", () => {
  it("Box renders a div with passthrough children", () => {
    render(<Box data-testid="box-1">hello</Box>);
    expect(screen.getByTestId("box-1")).toHaveTextContent("hello");
  });

  it("Text defaults to body variant", () => {
    render(<Text>copy</Text>);
    expect(screen.getByText("copy").tagName.toLowerCase()).toBe("p");
  });

  it("Text display variant renders an h1 with display font class", () => {
    render(<Text variant="display">Big</Text>);
    const heading = screen.getByText("Big");
    expect(heading.tagName.toLowerCase()).toBe("h1");
    expect(heading.className).toMatch(/font-display/);
  });
});

describe("Card", () => {
  it("renders a panel with bg-bg-card class", () => {
    render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId("card").className).toMatch(/bg-bg-card/);
  });
});

describe("Input", () => {
  it("renders an input element with placeholder", () => {
    render(<Input placeholder="email" />);
    expect(screen.getByPlaceholderText("email")).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("renders an inline-flex span", () => {
    render(<Badge>Pro</Badge>);
    const node = screen.getByText("Pro");
    expect(node.tagName.toLowerCase()).toBe("span");
    expect(node.className).toMatch(/inline-flex/);
  });
});
