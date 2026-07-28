import { Navigate, NavLink, Route, Routes } from "react-router";

import { useAuth } from "./auth/AuthContext";
import HistoryScreen from "./screens/HistoryScreen";
import LoginScreen from "./screens/LoginScreen";
import RecordScreen from "./screens/RecordScreen";

export default function App() {
  const { token, logout } = useAuth();

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <nav>
        <NavLink to="/record">녹화</NavLink>
        <NavLink to="/history">기록</NavLink>
        <button onClick={logout}>로그아웃</button>
      </nav>
      <Routes>
        <Route path="/record" element={<RecordScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="*" element={<Navigate to="/record" replace />} />
      </Routes>
    </>
  );
}
