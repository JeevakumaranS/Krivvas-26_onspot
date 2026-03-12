const jwt = require("jsonwebtoken");

function requireAdmin(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing admin token." });
  }

  const token = header.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "onspot-secret");
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired admin token." });
  }
}

module.exports = { requireAdmin };
