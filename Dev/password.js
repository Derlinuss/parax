const PROTECTED_PASSWORD = "ParaxOfficial_2026_Secure#Strong!";

function checkPassword() {
    if (sessionStorage.getItem("authenticated") === "true") return;

    firebase.auth().onAuthStateChanged((user) => {
        if (user && user.email === "Parax@parax.com") {
            sessionStorage.setItem("authenticated", "true");
            return;
        }

        const password = prompt("Enter password to access monitoring:");
        if (password === PROTECTED_PASSWORD) {
            sessionStorage.setItem("authenticated", "true");
        } else {
            alert("Access Denied");
            window.location.href = "/";
        }
    });
}

checkPassword();
