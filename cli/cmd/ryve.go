package cmd

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/user"

	"github.com/Psiphon-Inc/conduit/cli/internal/config"
	"github.com/Psiphon-Inc/conduit/cli/internal/crypto"

	"github.com/skip2/go-qrcode"
	"github.com/spf13/cobra"
)

var ryveCmd = &cobra.Command{
	Use:   "ryve",
	Short: "Get ryve association data",
	Long:  `Show Ryve association URI and Qr-code in both terminal and PNG format.`,
	RunE:  runRyve,
}

var (
	name            string
	inverseColor bool
	pngOutput       string
	pngSize         int16
)

func init() {
	var defaultName string

	if hostname, err := os.Hostname(); err == nil {
		defaultName = hostname + "-cli"
	} else {
		defaultName = "unknown-cli"
	}
	if userName, err := user.Current(); err == nil {
		defaultName += "-" + userName.Username
	}

	rootCmd.AddCommand(ryveCmd)

	ryveCmd.Flags().BoolVarP(&inverseColor, "inverse", "i", false, "inverse colors for terminals with white background (default: false)")
	ryveCmd.Flags().StringVarP(&name, "name", "n", defaultName, "Name for Ryve association (default: $HOST-cli-$USERNAME)")
	ryveCmd.Flags().StringVarP(&pngOutput, "output", "o", "", "PNG output file path (default: '')")
	ryveCmd.Flags().Int16VarP(&pngSize, "size", "s", 200, "PNG output dimensions (if --output is set, default: 200)")

}

func generateQrCode(uri string) (string, error) {
	q, err := qrcode.New(uri, qrcode.Low)

	if err != nil {
		return "", fmt.Errorf("failed to generate QR code: %s", err)
	}

	terminalOutput := q.ToSmallString(inverseColor)
	if pngOutput != "" {
		err = q.WriteFile(int(pngSize), pngOutput)

	}

	return terminalOutput, err

}

func runRyve(cmd *cobra.Command, args []string) error {

	datadir := GetDataDir()

	kp, _, err := config.LoadKey(datadir)
	if err != nil {
		fmt.Println("Error:", err)
		return fmt.Errorf("failed to load key: %s", err)
	}

	keyData, err := crypto.KeyPairToBase64NoPad(kp)
	if err != nil {
		fmt.Println("Error:", err)
		return fmt.Errorf("failed to get keypair data: %s", err)
	}

	payload := map[string]any{
		"version": 1,
		"data": map[string]any{
			"name": name,
			"key":  keyData,
		},
	}

	payloadJson, err := json.Marshal(payload)
	if err != nil {
		fmt.Println("Error:", err)
		return fmt.Errorf("unexpected: failed to marshal payload: %s", err)
	}

	claim := base64.StdEncoding.EncodeToString(payloadJson)
	uri := "network.ryve.app://(app)/conduits?claim=" + claim

	fmt.Println("Name:\t", name)
	fmt.Println("Key:\t", keyData)
	fmt.Println("Claim:\t", claim)
	fmt.Println("Uri:\t", uri)

	qrOutput, err := generateQrCode(uri)
	if err != nil {
		fmt.Println("Error:", err)
		return fmt.Errorf("failed to generate QR code: %s", err)
	}
	fmt.Println("\nQR Code:")
	fmt.Println(qrOutput)

	return nil
}
