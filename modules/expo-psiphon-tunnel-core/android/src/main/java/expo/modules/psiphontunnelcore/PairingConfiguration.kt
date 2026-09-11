package expo.modules.psiphontunnelcore

/** Private pairing readback. A successful core call is not a broker announcement. */
internal class PairingConfiguration(
    private val nextRevision: () -> Long,
    private val onChanged: () -> Unit,
) {
    @Volatile
    var snapshot: Map<String, Any?> = emptyMap()
        private set

    // Caller must establish that the core is stopped before restoring persisted settings.
    fun restorePersisted(personalCompartmentId: String?) {
        update("persisted", personalCompartmentId)
    }

    fun applying() = update("applying", null)

    // Caller serializes core operations; the result is read back from getPsiphonConfig.
    fun applyToCore(startOrRestart: () -> String?) {
        val revision = applying()
        val appliedId = startOrRestart() // Failure intentionally leaves sharing unavailable.
        synchronized(this) {
            if (snapshot["revision"] == revision) update("applied", appliedId)
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
