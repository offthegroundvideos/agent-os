import OsShell from "../../components/os/OsShell";
import "./os.css";

export const metadata = {
  title: "OTG-OS",
  description: "OFF THE GROUND operating system: approvals, pipeline, portfolio and settings.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#03040c",
};

export default function OsLayout({ children }) {
  return <OsShell>{children}</OsShell>;
}
