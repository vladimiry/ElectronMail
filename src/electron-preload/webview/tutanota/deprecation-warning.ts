export function setupDeprecationWarning() {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(processAddedNode);
        }
    });
    const processAddedNode = (addedNode: Node | Element) => {
        if (
            !("id" in addedNode)
            ||
            addedNode.id !== "root"
        ) {
            return;
        }
        observer.disconnect();
        mountWarningToDOM();
    };

    observer.observe(
        document,
        {childList: true, subtree: true},
    );
}

function mountWarningToDOM() {
    const block = document.createElement("div");

    Object.assign(
        block.style,
        ((cssStyleDeclaration: Partial<CSSStyleDeclaration>) => cssStyleDeclaration)({
            backgroundColor: "#f8d7da",
            border: "1px solid #721c24",
            color: "#721c24",
            left: "25%",
            padding: ".75em",
            position: "fixed",
            textAlign: "center",
            top: "30px",
            width: "50%",
            zIndex: "50000",
        }),
    );

    block.innerHTML = `
        <p style="margin-bottom: .75em;">
            Tutanota support is deprecated by ElectronMail since July 2019 and going to be removed with next release.
            See <a href="https://github.com/vladimiry/ElectronMail/issues/180">issue #180</a> for details.
        </p>
        <a href="javascript:void(0);" onclick="document.body.removeChild(this.parentNode);">
            <strong>Close</strong>
        </a>
    `;

    document.body.appendChild(block);
}
