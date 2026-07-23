document.addEventListener('contextmenu', (e) => {
    const serverItem = e.target.closest('.server-item');
    if (serverItem && serverItem.dataset.code) {
        e.preventDefault();
        const menu = document.getElementById('server-context-menu');
        if (!menu) return;
        menu.style.display = 'block';
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';
        window.contextServerCode = serverItem.dataset.code;
    }
});

document.addEventListener('click', () => {
    const menu = document.getElementById('server-context-menu');
    if (menu) menu.style.display = 'none';
});

document.getElementById('ctx-leave')?.addEventListener('click', async () => {
    const code = window.contextServerCode;
    if (!code) return;
    if (code === "00000000001") { // PARAX_OFFICIAL_CODE
        alert('Cannot leave the official server');
        return;
    }
    if (confirm('Leave this server?')) {
        try {
            const user = firebase.auth().currentUser;
            if (!user) return;
            await firebase.firestore().collection('serverMembers').doc(user.uid + "|" + code).delete();
            window.location.reload();
        } catch (err) {
            alert('Failed to leave: ' + err.message);
        }
    }
});
