package expo.modules.psiphontunnelcore

/** Private pairing readback. A successful core call is not a broker announcement. */
internal class PairingConfiguration(
    private val nextRevision: () -> Long,
    private val onChanged: () -> Unit,
) {
    @Volatile
    var snapshot: Map<String, Any?> = emptyMap()
        private set

    // A captured null ID is distinct from not receiving getPsiphonConfig at all.
    private class CoreReadback(val personalCompartmentId: String?)
    @Volatile
    private var coreReadback: CoreReadback? = null

    fun recordCoreReadback(personalCompartmentId: String?) {
        coreReadback = CoreReadback(personalCompartmentId)
    }

    // Caller must establish that the core is stopped before restoring persisted settings.
    fun restorePersisted(personalCompartmentId: String?) {
        update("persisted", personalCompartmentId)
    }

    fun applying() = update("applying", null)

    // Caller serializes core operations; only fresh getPsiphonConfig readback can acknowledge one.
    fun applyToCore(startOrRestart: () -> Unit) {
        coreReadback = null
        val revision = applying()
        startOrRestart() // Failure intentionally leaves sharing unavailable.
        val readback = coreReadback ?: return
        synchronized(this) {
            if (snapshot["revision"] == revision) update("applied", readback.personalCompartmentId)
        }
    }

    @Synchronized
    private fun update(status: String, personalCompartmentId: String?): Long {
        val revision = nextRevision()
        snapshot = mapOf(
            "revision" to revision,
            "status" to status,
            "personalCompartmentId" to personalCompartmentId,
        )
        onChanged()
        return revision
    }
}
