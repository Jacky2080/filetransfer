import { verify } from "jsonwebtoken";

export async function getServerSideProps({ req }) {
  const cookieHeader = req.headers.cookie || "";

  const token = cookieHeader
    .split(";")
    .find((c) => c.trim().startsWith("token="))
    ?.split("=")[1];

  if (!token) {
    return { redirect: { destination: "/fail/index.html", permanent: false } };
  }

  try {
    verify(token, process.env.JWT_SECRET);
    return { redirect: { destination: "/success/index.html", permanent: false } };
  } catch {
    return { redirect: { destination: "/fail/index.html", permanent: false } };
  }
}
