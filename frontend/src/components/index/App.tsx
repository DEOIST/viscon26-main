import ShellLayout from "../common/ShellLayout";
import WelcomeScreen from "./WelcomeScreen";

export default function App() {
    return (
        <ShellLayout title="Welcome">
            <WelcomeScreen
                onStart={() => {
                    window.location.href = "/enroll";
                }}
            />
        </ShellLayout>
    );
}
